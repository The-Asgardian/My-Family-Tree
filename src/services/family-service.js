import { config } from '../config.js';
import { mockTree } from '../data/mock-data.js';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase.js';

const clone = value => JSON.parse(JSON.stringify(value));
let demoTree = clone(mockTree);

function mapPerson(row, photoUrl = '') {
  return {
    id: row.id,
    fullName: row.full_name,
    preferredName: row.preferred_name,
    dateOfBirth: row.date_of_birth,
    estimatedAge: row.estimated_age,
    isDeceased: row.is_deceased,
    dateOfDeath: row.date_of_death,
    birthplace: row.birthplace,
    about: row.about,
    photoPath: row.photo_path,
    photoUrl
  };
}

function mapRelationship(row) {
  return {
    id: row.id,
    type: row.relationship_type,
    personAId: row.person_a_id,
    personBId: row.person_b_id,
    metadata: row.metadata || {}
  };
}

export const familyService = {
  mode: isSupabaseConfigured() ? 'supabase' : 'demo',

  async getSession() {
    if (!isSupabaseConfigured()) return null;
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  async signInWithEmail(email) {
    const supabase = await getSupabase();
    const emailRedirectTo = new URL('./', window.location.href).href;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo }
    });
    if (error) throw error;
  },

  async signOut() {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async onAuthStateChange(callback) {
    if (!isSupabaseConfigured()) return () => {};
    const supabase = await getSupabase();
    const { data } = supabase.auth.onAuthStateChange(callback);
    return () => data.subscription.unsubscribe();
  },

  async listTrees() {
    if (!isSupabaseConfigured()) return [{ id: demoTree.id, name: demoTree.name, slug: demoTree.slug }];
    const supabase = await getSupabase();
    const { data, error } = await supabase.from('trees').select('id,name,slug,created_at').order('created_at');
    if (error) throw error;
    return data;
  },

  async createTree(name) {
    const supabase = await getSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error('Sign in before creating a family tree.');

    const { data: tree, error: treeError } = await supabase
      .from('trees')
      .insert({ name, owner_id: userData.user.id })
      .select('id,name,slug')
      .single();
    if (treeError) throw treeError;

    const { error: memberError } = await supabase.from('tree_members').insert({
      tree_id: tree.id,
      user_id: userData.user.id,
      role: 'owner'
    });
    if (memberError) throw memberError;
    return tree;
  },

  async loadTree(treeId = config.defaultTreeId) {
    if (!isSupabaseConfigured() || !treeId) return clone(demoTree);
    const supabase = await getSupabase();
    const [{ data: tree, error: treeError }, { data: people, error: peopleError }, { data: relationships, error: relError }] = await Promise.all([
      supabase.from('trees').select('id,name,slug').eq('id', treeId).single(),
      supabase.from('people').select('*').eq('tree_id', treeId).order('created_at'),
      supabase.from('relationships').select('*').eq('tree_id', treeId).is('deleted_at', null).order('created_at')
    ]);
    if (treeError) throw treeError;
    if (peopleError) throw peopleError;
    if (relError) throw relError;
    const photoPaths = people.map(person => person.photo_path).filter(Boolean);
    const signedPhotoUrls = new Map();
    if (photoPaths.length) {
      const { data: signed, error: photoError } = await supabase.storage.from('family-photos').createSignedUrls(photoPaths, 3600);
      if (photoError) throw photoError;
      signed.forEach(item => signedPhotoUrls.set(item.path, item.signedUrl));
    }
    return {
      ...tree,
      people: people.map(person => mapPerson(person, signedPhotoUrls.get(person.photo_path) || '')),
      relationships: relationships.map(mapRelationship)
    };
  },

  async createPerson(treeId, person) {
    if (!isSupabaseConfigured() || !treeId || treeId === 'demo-tree') {
      const created = { ...person, id: crypto.randomUUID() };
      demoTree.people.push(created);
      return clone(created);
    }
    const supabase = await getSupabase();
    const { data, error } = await supabase.from('people').insert({
      tree_id: treeId,
      full_name: person.fullName,
      date_of_birth: person.dateOfBirth || null,
      estimated_age: person.estimatedAge ?? null,
      is_deceased: person.isDeceased || false,
      date_of_death: person.dateOfDeath || null,
      birthplace: person.birthplace || null,
      about: person.about || null,
      photo_path: person.photoPath || null
    }).select().single();
    if (error) throw error;
    return mapPerson(data);
  },

  async createRelationship(treeId, relationship) {
    if (!isSupabaseConfigured() || !treeId || treeId === 'demo-tree') {
      const created = { ...relationship, id: crypto.randomUUID() };
      demoTree.relationships.push(created);
      return clone(created);
    }
    const supabase = await getSupabase();
    const { data, error } = await supabase.from('relationships').insert({
      tree_id: treeId,
      relationship_type: relationship.type,
      person_a_id: relationship.personAId,
      person_b_id: relationship.personBId,
      metadata: relationship.metadata || {}
    }).select().single();
    if (error) throw error;
    return mapRelationship(data);
  },

  async uploadPersonPhoto(treeId, personId, file) {
    if (!isSupabaseConfigured() || !treeId || treeId === 'demo-tree') return null;
    const supabase = await getSupabase();
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${treeId}/${personId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('family-photos').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false
    });
    if (uploadError) throw uploadError;

    const { data: updated, error: updateError } = await supabase
      .from('people')
      .update({ photo_path: path })
      .eq('tree_id', treeId)
      .eq('id', personId)
      .select()
      .single();
    if (updateError) {
      await supabase.storage.from('family-photos').remove([path]);
      throw updateError;
    }

    const { data: signed, error: signedError } = await supabase.storage.from('family-photos').createSignedUrl(path, 3600);
    if (signedError) throw signedError;
    return mapPerson(updated, signed.signedUrl);
  },

  async updatePerson(treeId, personId, patch) {
    if (!isSupabaseConfigured() || !treeId || treeId === 'demo-tree') {
      const index = demoTree.people.findIndex(p => p.id === personId);
      if (index < 0) throw new Error('Person not found');
      demoTree.people[index] = { ...demoTree.people[index], ...patch };
      return clone(demoTree.people[index]);
    }
    const supabase = await getSupabase();
    const payload = {};
    if ('fullName' in patch) payload.full_name = patch.fullName;
    if ('dateOfBirth' in patch) payload.date_of_birth = patch.dateOfBirth || null;
    if ('estimatedAge' in patch) payload.estimated_age = patch.estimatedAge ?? null;
    if ('isDeceased' in patch) payload.is_deceased = patch.isDeceased;
    if ('dateOfDeath' in patch) payload.date_of_death = patch.dateOfDeath || null;
    if ('birthplace' in patch) payload.birthplace = patch.birthplace || null;
    if ('about' in patch) payload.about = patch.about || null;
    const { data, error } = await supabase.from('people').update(payload).eq('tree_id', treeId).eq('id', personId).select().single();
    if (error) throw error;
    return mapPerson(data, patch.photoUrl || '');
  },

  async subscribeToTree(treeId, callback) {
    if (!isSupabaseConfigured() || !treeId || treeId === 'demo-tree') return () => {};
    const supabase = await getSupabase();
    const channel = supabase
      .channel(`family-tree:${treeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'people', filter: `tree_id=eq.${treeId}` }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships', filter: `tree_id=eq.${treeId}` }, callback)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }
};
