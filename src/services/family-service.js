import { config } from '../config.js';
import { getSupabase } from '../lib/supabase.js';

function mapPerson(row, photoUrl = '') {
  return {
    id: row.id,
    fullName: row.full_name,
    sourceFullName: row.full_name,
    firstName: row.first_name,
    storedFirstName: row.first_name,
    lastName: row.last_name,
    storedLastName: row.last_name,
    gender: row.gender,
    storedGender: row.gender,
    preferredName: row.preferred_name,
    dateOfBirth: row.date_of_birth,
    dateOfBirthPrecision: row.date_of_birth_precision || (row.date_of_birth ? 'day' : 'unknown'),
    estimatedAge: row.estimated_age,
    isDeceased: row.is_deceased,
    dateOfDeath: row.date_of_death,
    dateOfDeathPrecision: row.date_of_death_precision || (row.date_of_death ? 'day' : 'unknown'),
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
  async loadTree(treeId = config.defaultTreeId) {
    if (!treeId) throw new Error('The family tree is not configured.');
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
      first_name: person.firstName || null,
      last_name: person.lastName || null,
      gender: person.gender || null,
      date_of_birth: person.dateOfBirth || null,
      date_of_birth_precision: person.dateOfBirthPrecision || 'unknown',
      estimated_age: person.estimatedAge ?? null,
      is_deceased: person.isDeceased || false,
      date_of_death: person.dateOfDeath || null,
      date_of_death_precision: person.dateOfDeathPrecision || 'unknown',
      birthplace: person.birthplace || null,
      about: person.about || null,
      photo_path: person.photoPath || null
    }).select().single();
    if (error) throw error;
    return mapPerson(data);
  },

  async deletePerson(treeId, personId, photoPath = '') {
    if (!treeId) throw new Error('Choose a family tree before removing a person.');
    const supabase = await getSupabase();
    const { error } = await supabase.from('people').delete().eq('tree_id', treeId).eq('id', personId);
    if (error) throw error;
    if (photoPath) {
      const { error: photoError } = await supabase.storage.from('family-photos').remove([photoPath]);
      // The database deletion is authoritative. A failed storage cleanup must not
      // make the UI report that the person still exists.
      if (photoError) console.warn('The deleted person portrait could not be removed.', photoError);
    }
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

  async uploadPersonPhoto(treeId, personId, file, previousPath = '') {
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
    if (previousPath && previousPath !== path) {
      const { error: removeError } = await supabase.storage.from('family-photos').remove([previousPath]);
      if (removeError) console.warn('The previous portrait could not be removed.', removeError);
    }
    return mapPerson(updated, signed.signedUrl);
  },

  async updatePerson(treeId, personId, patch) {
    if (!treeId) throw new Error('Choose a family tree before updating a person.');
    const supabase = await getSupabase();
    const payload = {};
    if ('fullName' in patch) payload.full_name = patch.fullName;
    if ('firstName' in patch) payload.first_name = patch.firstName || null;
    if ('lastName' in patch) payload.last_name = patch.lastName || null;
    if ('gender' in patch) payload.gender = patch.gender || null;
    if ('dateOfBirth' in patch) payload.date_of_birth = patch.dateOfBirth || null;
    if ('dateOfBirthPrecision' in patch) payload.date_of_birth_precision = patch.dateOfBirthPrecision || 'unknown';
    if ('estimatedAge' in patch) payload.estimated_age = patch.estimatedAge ?? null;
    if ('isDeceased' in patch) payload.is_deceased = patch.isDeceased;
    if ('dateOfDeath' in patch) payload.date_of_death = patch.dateOfDeath || null;
    if ('dateOfDeathPrecision' in patch) payload.date_of_death_precision = patch.dateOfDeathPrecision || 'unknown';
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
