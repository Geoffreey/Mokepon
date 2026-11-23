const RULES=[
 {nombre:"B'atz",victorias:10,puntos:500,gold:500,missions:['eco-selva','fuego-ancestral'],challenge:'Completa El eco de la selva y Fuego ancestral'},
 {nombre:'Tacuatzin',victorias:25,puntos:1200,gold:1200,levels:['selva','ruinas','volcan'],challenge:'Supera las tres pantallas de Arcade'}
]
function unlocked(nombre,stats={},progress={},account={}){
 const rule=RULES.find(r=>r.nombre===nombre)
 return !rule||account?.rol==='admin'||progress.unlocks?.some(u=>u.type==='mascota'&&u.id===nombre)||stats.victorias>=rule.victorias&&stats.puntos>=rule.puntos||Boolean(rule.missions?.every(id=>progress.completedMissions?.includes(id)))||Boolean(rule.levels?.every(id=>progress.arcadeCompleted?.includes(id)))
}
function catalog(stats,progress,account){return RULES.map(r=>({...r,desbloqueado:Boolean(unlocked(r.nombre,stats,progress,account)),challengeProgress:r.missions?r.missions.filter(id=>progress.completedMissions.includes(id)).length:r.levels.filter(id=>progress.arcadeCompleted.includes(id)).length,challengeTotal:(r.missions||r.levels).length}))}
module.exports={RULES,unlocked,catalog}
