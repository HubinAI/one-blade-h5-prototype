lines = open("src/game/Game.ts","r",encoding="utf-8").readlines()
needle = "const isLevel1 = this.isLogicalLevel1"
for i, l in enumerate(lines):
    if i > 2000 and needle in l:
        lines.insert(i, "    const slashBonus = this.getSlashScoreBonus(trail.kills);\n")
        lines.insert(i+1, "    if (slashBonus > 0) this.score += slashBonus;\n")
        break
open("src/game/Game.ts","w",encoding="utf-8").writelines(lines)
print("OK")
