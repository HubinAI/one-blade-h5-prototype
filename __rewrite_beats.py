import re

with open('src/game/systems/PostEdictDirector.ts', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find('const BEATS: DirectorBeat[]')
if start < 0: print('NOT FOUND'); exit(1)

end = content.find('];', start)
if end < 0: print('NO END'); exit(1)
end += 2

prefix = content[:start]
suffix = content[end:]

mid = content[start:end]
p1_end = mid.find('  },', mid.find('P1-3'))
p1_beats = mid[:p1_end+3]

new_beats = '''
  {
    id: 'P2-1', phase: 'P2', notBeforeMs: 0,
    microBatches: [
      { count: 4, tiers: [["trash",4]], formationId: 'left_front',  xRange: X_LEFT,  row: 'front', internalDelay: 0, speedBonus: 0 },
      { count: 4, tiers: [["trash",4]], formationId: 'right_back',  xRange: X_RIGHT, row: 'back',  internalDelay: 0.30, speedBonus: 0 },
    ],
  },
  {
    id: 'P2-2', phase: 'P2', notBeforeMs: 1800,
    microBatches: [
      { count: 4, tiers: [["trash",3],["tough",1]], formationId: 'right_high_diag', xRange: X_RIGHT, row: 'mid', internalDelay: 0, speedBonus: 0, powders: 1 },
      { count: 4, tiers: [["trash",4]],              formationId: 'left_low_diag',  xRange: X_LEFT,  row: 'mid', internalDelay: 0.28, speedBonus: 0 },
    ],
  },
  {
    id: 'P2-3', phase: 'P2', notBeforeMs: 3600,
    microBatches: [
      { count: 4, tiers: [["trash",2],["tough",2]], formationId: 'left_expand',  xRange: X_LEFT,  row: 'front', internalDelay: 0, speedBonus: 0, powders: 1 },
      { count: 4, tiers: [["trash",3],["tough",1]], formationId: 'right_expand', xRange: X_RIGHT, row: 'back',  internalDelay: 0.28, speedBonus: 0 },
    ],
  },
  {
    id: 'P2-4', phase: 'P2', notBeforeMs: 5400,
    microBatches: [
      { count: 5, tiers: [["trash",2],["tough",3]], formationId: 'front_wide', xRange: X_WIDE, row: 'front', internalDelay: 0, speedBonus: 0, powders: 1 },
      { count: 5, tiers: [["trash",3],["tough",2]], formationId: 'back_wide',  xRange: X_WIDE, row: 'back',  internalDelay: 0.26, speedBonus: 0 },
    ],
  },
  {
    id: 'P2-5', phase: 'P2', notBeforeMs: 7200,
    microBatches: [
      { count: 6, tiers: [["trash",4],["tough",2]], formationId: 'center_expand', xRange: X_CENTER, row: 'mid', internalDelay: 0.22, speedBonus: 0.04 },
    ],
  },

  // P3 6 beat 44 rapidPulse + 2 splitter
  {
    id: 'P3-1', phase: 'P3', notBeforeMs: 0,
    microBatches: [
      { count: 4, tiers: [["trash",4]], formationId: 'scatter_sparse', xRange: X_WIDE, row: 'mid', internalDelay: 0, speedBonus: 0, rapidPulse: true, splitters: 1 },
    ],
  },
  {
    id: 'P3-2', phase: 'P3', notBeforeMs: 1500,
    microBatches: [
      { count: 4, tiers: [["trash",2],["tough",2]], formationId: 'left_expand',  xRange: X_LEFT,  row: 'back', internalDelay: 0.28, speedBonus: 0, rapidPulse: true },
      { count: 4, tiers: [["trash",1],["tough",3]], formationId: 'right_expand', xRange: X_RIGHT, row: 'mid',  internalDelay: 0,    speedBonus: 0, rapidPulse: true },
    ],
  },
  {
    id: 'P3-3', phase: 'P3', notBeforeMs: 3000,
    microBatches: [
      { count: 4, tiers: [["trash",2],["tough",2]], formationId: 'back_wide', xRange: X_WIDE, row: 'back', internalDelay: 0, speedBonus: 0, rapidPulse: true },
    ],
  },
  {
    id: 'P3-4', phase: 'P3', notBeforeMs: 4500,
    microBatches: [
      { count: 4, tiers: [["trash",1],["tough",3]], formationId: 'front_wide', xRange: X_WIDE, row: 'front', internalDelay: 0, speedBonus: 0.06, rapidPulse: true },
    ],
  },
  {
    id: 'P3-5', phase: 'P3', notBeforeMs: 6000,
    microBatches: [
      { count: 4, tiers: [["trash",1],["tough",3]], formationId: 'scattered_walls', xRange: X_WIDE, row: 'mid', internalDelay: 0.30, speedBonus: 0, rapidPulse: true },
    ],
  },
  {
    id: 'P3-6', phase: 'P3', notBeforeMs: 7500,
    microBatches: [
      { count: 4, tiers: [["tough",4]], formationId: 'front_tough', xRange: X_WIDE, row: 'front', internalDelay: 0, speedBonus: 0.04, rapidPulse: true, splitters: 1 },
    ],
  },
'''

result = prefix + p1_beats + ',\n' + new_beats + '];\n' + suffix.split('];', 1)[1]

with open('src/game/systems/PostEdictDirector.ts', 'w', encoding='utf-8') as f:
    f.write(result)

print('done')
