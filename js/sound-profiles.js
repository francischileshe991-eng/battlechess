// Original synthesized identities, not recorded voices. Attacker and victim
// profiles are deliberately separate: a pawn hitting a knight sounds different
// from the same pawn hitting a mage. Kings are never capture victims.
export const attackSounds = {
  p: { name: 'Heavy infantry steel', metal: 285, weight: .22, ring: .28, shout: [180, 245, .17] },
  n: { name: 'Lance and charging armor', metal: 470, weight: .18, ring: .2, shout: [155, 240, .2] },
  b: { name: 'Arcane surge', metal: 0, weight: .1, ring: .23, shout: [235, 300, .18] },
  r: { name: 'Crushing hammer', metal: 195, weight: .3, ring: .23, shout: [110, 155, .23] },
  q: { name: 'Twin royal blades', metal: 590, weight: .15, ring: .18, shout: [250, 340, .16] },
  k: { name: 'Royal greatsword', metal: 360, weight: .25, ring: .3, shout: [140, 190, .22] },
};
export const defeatSounds = {
  p: { name: 'Infantry scream and shield fall', segments: [[350, 430, .09], [430, 185, .16], [185, 95, .12]], grit: .1, fall: 320, open: true },
  n: { name: 'Muffled rider cry and horse distress', segments: [[240, 190, .12], [190, 85, .23]], grit: .09, fall: 680, open: false, horse: true },
  b: { name: 'Spectral mage wail', segments: [[540, 610, .1], [610, 160, .26]], grit: .045, fall: 1150, open: false, magic: true },
  r: { name: 'Guttural guardian roar and armor crash', segments: [[155, 125, .12], [125, 55, .25]], grit: .16, fall: 190, open: true },
  q: { name: 'Commander gasp and falling cry', segments: [[440, 500, .08], [500, 230, .14], [230, 120, .14]], grit: .075, fall: 890, open: true },
};
