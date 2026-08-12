import { config } from '../config.js';
import { getSupabase } from '../lib/supabase.js';

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
  async getSession() {
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
    const supabase = await getSupabase();
    const { data } = supabase.auth.onAuthStateChange(callback);
    return () => data.subscription.unsubscribe();
  },

  async listTrees() {
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

    const tree = {
      id: crypto.randomUUID(),
      name: name.trim(),
      slug: null
    };
    const { error: treeError } = await supabase
      .from('trees')
      .insert({ id: tree.id, name: tree.name, owner_id: userData.user.id });
    if (treeError) throw treeError;

    const { error: memberError } = await supabase.from('tree_members').insert({
      tree_id: tree.id,
      user_id: userData.user.id,
      role: 'owner'
    });
    if (memberError) {
      const { error: rollbackError } = await supabase.from('trees').delete().eq('id', tree.id);
      if (rollbackError) console.error('Unable to roll back incomplete tree creation', rollbackError);
      throw memberError;
    }
    return tree;
  },

  async loadTree(treeId = config.defaultTreeId) {
    if (!treeId) throw new Error('Choose a family tree before loading its members.');
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
    if (!treeId) throw new Error('Choose a family tree before adding a person.');
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

  async deletePerson(treeId, personId) {
    if (!treeId) throw new Error('Choose a family tree before removing a person.');
    const supabase = await getSupabase();
    const { error } = await supabase.from('people').delete().eq('tree_id', treeId).eq('id', personId);
    if (error) throw error;
  },

  async createRelationship(treeId, relationship) {
    if (!treeId) throw new Error('Choose a family tree before adding a relationship.');
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
    if (!treeId) throw new Error('Choose a family tree before uploading a photo.');
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
    if (!treeId) throw new Error('Choose a family tree before updating a person.');
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
    return mapPerson(data);
  },

  async subscribeToTree(treeId, callback) {
    if (!treeId) return () => {};
    const supabase = await getSupabase();
    const channel = supabase
      .channel(`family-tree:${treeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'people', filter: `tree_id=eq.${treeId}` }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationships', filter: `tree_id=eq.${treeId}` }, callback)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }
};
