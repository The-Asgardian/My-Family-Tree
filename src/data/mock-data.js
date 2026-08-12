export const mockTree = {
  id: 'demo-tree',
  name: 'Hayre Family',
  people: [
    { id: 'harjit', fullName: 'Harjit Hayre', dateOfBirth: '1948-03-02', estimatedAge: 78, photoUrl: '', birthplace: 'Punjab, India', about: '', isDeceased: false },
    { id: 'surjit', fullName: 'Surjit Kaur', dateOfBirth: '1951-08-18', estimatedAge: 75, photoUrl: '', birthplace: 'Punjab, India', about: '', isDeceased: false },
    { id: 'raj', fullName: 'Raj Hayre', dateOfBirth: '1975-05-04', estimatedAge: 51, photoUrl: '', birthplace: 'United Kingdom', about: '', isDeceased: false },
    { id: 'priya', fullName: 'Priya Hayre', dateOfBirth: '1978-09-15', estimatedAge: 48, photoUrl: '', birthplace: 'United Kingdom', about: '', isDeceased: false },
    { id: 'manpreet', fullName: 'Manpreet Hayre', dateOfBirth: '1981-11-10', estimatedAge: 45, photoUrl: '', birthplace: 'United Kingdom', about: '', isDeceased: false },
    { id: 'gurpreet', fullName: 'Gurpreet Kaur', dateOfBirth: '1984-06-22', estimatedAge: 42, photoUrl: '', birthplace: 'United Kingdom', about: '', isDeceased: false },
    { id: 'arjan', fullName: 'Arjan Hayre', dateOfBirth: '2003-05-12', estimatedAge: 23, photoUrl: '', birthplace: 'London, United Kingdom', about: 'Add a note about Arjan…', isDeceased: false },
    { id: 'jas', fullName: 'Jas Hayre', dateOfBirth: '2005-01-14', estimatedAge: 21, photoUrl: '', birthplace: 'London, United Kingdom', about: '', isDeceased: false },
    { id: 'karan', fullName: 'Karan Hayre', dateOfBirth: '2008-07-01', estimatedAge: 18, photoUrl: '', birthplace: 'London, United Kingdom', about: '', isDeceased: false }
  ],
  relationships: [
    { id: 'p1', type: 'partner', personAId: 'harjit', personBId: 'surjit' },
    { id: 'p2', type: 'partner', personAId: 'raj', personBId: 'priya' },
    { id: 'p3', type: 'partner', personAId: 'manpreet', personBId: 'gurpreet' },
    { id: 'pc1', type: 'parent_child', personAId: 'harjit', personBId: 'raj' },
    { id: 'pc2', type: 'parent_child', personAId: 'surjit', personBId: 'raj' },
    { id: 'pc3', type: 'parent_child', personAId: 'harjit', personBId: 'manpreet' },
    { id: 'pc4', type: 'parent_child', personAId: 'surjit', personBId: 'manpreet' },
    { id: 'pc5', type: 'parent_child', personAId: 'raj', personBId: 'arjan' },
    { id: 'pc6', type: 'parent_child', personAId: 'priya', personBId: 'arjan' },
    { id: 'pc7', type: 'parent_child', personAId: 'raj', personBId: 'jas' },
    { id: 'pc8', type: 'parent_child', personAId: 'priya', personBId: 'jas' },
    { id: 'pc9', type: 'parent_child', personAId: 'raj', personBId: 'karan' },
    { id: 'pc10', type: 'parent_child', personAId: 'priya', personBId: 'karan' }
  ]
};
