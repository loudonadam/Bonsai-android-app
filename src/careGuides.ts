import { CareGuide } from './types';

export const careGuides: CareGuide[] = [
  {
    id: 'juniper',
    species: 'Juniper',
    scientificName: 'Juniperus spp.',
    difficulty: 'Beginner',
    placement: 'Outdoor only. Junipers require full sunlight and need cold winter temperatures (dormancy period) to thrive. Do not keep them indoors.',
    watering: 'Water only when the soil feels slightly dry. Never let the soil dry out completely, but avoid continuous waterlogging which rots the root systems.',
    fertilizing: 'Apply standard organic organic fertilizer once every two weeks during the growing season (spring to autumn). Do not fertilize in winter.',
    pruning: 'To maintain the foliage pads, pinch out new shoots. Do not use shears to trim foliage like a hedge, as the cut needle tips will brown.',
    repotting: 'Repot once every two to three years in early spring using a fast-draining soil mix (e.g. Akadama, Pumice, Lava rock in 2:1:1 ratio).',
    summary: 'The classic outdoor bonsai, famous for its rugged foliage and suitability for elegant deadwood designs (Shari and Jin).',
    seasonCare: {
      spring: 'Excellent time for repotting. Start liquid fertilizing as bud growth begins. Wire structures before needles stiffen.',
      summer: 'Thrives in intense sun but water twice daily in heatpeaks. Prune active shoots by pinching new growths.',
      autumn: 'Slow down fertilizing. Move trees to a wind-sheltered spot to prepare for frosty weather.',
      winter: 'Requires outdoor winter protection. Shelter roots from heavy freezing temperatures, but keep in an unheated cold-frame or greenhouse.'
    }
  },
  {
    id: 'japanese-maple',
    species: 'Japanese Maple',
    scientificName: 'Acer palmatum',
    difficulty: 'Intermediate',
    placement: 'Outdoor. Enjoys bright morning sun but needs light afternoon shade during peak summer to avoid delicate leaf-burn.',
    watering: 'Requires high moisture level. Water daily during active seasons; keep soil damp but ensure proper drainage to protect roots.',
    fertilizing: 'Fertilize weekly in spring with high-nitrogen nutrient, switching to low-nitrogen in late summer. Stop entirely as leaves drop.',
    pruning: 'Hard prune branches in autumn or winter. Fine twig styling is done in spring by pinching back shoots to one pair of leaves.',
    repotting: 'Repot every two years in late winter / early spring before buds open. Active root growth responds well to intensive root pruning.',
    summary: 'Breathtaking deciduous tree highly sought-after for its spectacular autumn leaf colors, palmate lobes, and delicate winter silhouette.',
    seasonCare: {
      spring: 'Defoliate or pinch back strong shoots. Watch out for late frost which can kill fresh young spring leaves.',
      summer: 'Protect leaves from leaf scorch in partial shade. Keep soil moist; do not allow maples to dry out completely under the sun.',
      autumn: 'Enjoy spectacular gold and scarlet color transformations. Reduce watering as leaves drop and dormancy approaches.',
      winter: 'Ensure wind and frost protection for branches. Protect soft wood from drying winter gales.'
    }
  },
  {
    id: 'chinese-elm',
    species: 'Chinese Elm',
    scientificName: 'Ulmus parvifolia',
    difficulty: 'Beginner',
    placement: 'Highly adaptable. Can be kept outdoors in mild winter areas, or indoors in a bright window during winter months.',
    watering: 'Water generously as soon as the topsoil begins to dry. They are resilient to slight neglect but thrive on high consistency.',
    fertilizing: 'Fertilize with balanced liquid nutrients every 2 weeks from spring to mid-autumn when active growth is visible.',
    pruning: 'Very resilient to frequent trimming. Allow shoots to grow 3 to 4 nodes, then cut back to 1 or 2 leaves to encourage highly dense ramification.',
    repotting: 'Repot every 2 years in early spring. Roots grow incredibly fast and can quickly choke drainage holes.',
    summary: 'The ideal model for beginners. Tough, forgiving of watering mistakes, has tiny graceful leaves, and responds exceptionally well to styling.',
    seasonCare: {
      spring: 'Trim back extensive branch growth to shape. Feed aggressively to encourage fine branch ramification.',
      summer: 'Will grow fast. Trim back outer growth to maintain compact silhouette and prevent inner-layer dieback.',
      autumn: 'Outdoor elms will drop their leaves; indoor elms will remain semi-evergreen. Transition indoor elms near sunny windows.',
      winter: 'Protect outdoors if temperatures drop below freezing. Keep indoors cool and water sparingly to mimic dormancy.'
    }
  },
  {
    id: 'ficus',
    species: 'Ficus Retusa',
    scientificName: 'Ficus microcarpa',
    difficulty: 'Beginner',
    placement: 'Great indoor and outdoor tree. Prefers high humidity and warm temperatures. If outdoors during summer, move indoors when temperature drops below 15°C.',
    watering: 'Water whenever the soil is moderately dry. Ficus has thick waxy leaves that resist dry spells, but responds beautifully to fine misting.',
    fertilizing: 'Feed monthly throughout the year because tropical indoor trees do not go completely dormant. Feed bi-weekly in summer.',
    pruning: 'Prune leaf shoots back to 2 leaves after growing 6-8 leaves. Ficus bleeds white milky latex when cut, which scabs wounds naturally.',
    repotting: 'Repot every other year in mid-summer when the tropical roots are actively thriving in high warmth.',
    summary: 'The ultimate indoor bonsai. Excels in high humidity, and generates stunning hanging aerial roots that give an ancient jungle look.',
    seasonCare: {
      spring: 'Feed and move outdoors once nighttime temperatures consistently exceed 15°C (60°F). Great time for heavy wire stylings.',
      summer: 'Thrives in tropical heat and high humidity. Leave in full sun to reduce leaf scale and develop robust aerial roots.',
      autumn: 'Prune back long shoots before bringing indoors. Inspect thoroughly for pests before placing with other indoor houseplants.',
      winter: 'Keep warm inside a humid, sunny room. Water more sparingly, mist foliage, and utilize pebble trays to maintain humidity.'
    }
  },
  {
    id: 'dwarf-jade',
    species: 'Dwarf Jade',
    scientificName: 'Portulacaria afra',
    difficulty: 'Beginner',
    placement: 'Indoors/Outdoors. Requires very high levels of direct light. Must be protected from freezing cold (minimum temperature 5°C).',
    watering: 'Extremely drought tolerant succulent. Store water in trunk and leaves—only water when the soil is completely dry. Overwatering will rot stems immediately.',
    fertilizing: 'Apply a dilute balanced fertilizer once a month from spring to autumn. Do not feed in winter.',
    pruning: 'Pinch out growing tips with fingers. Trim fleshy stems with a sharp sanitized knife. Heals quickly without needing cut paste.',
    repotting: 'Repot every 2 to 3 years in late spring or summer. Use an extremely gritty cactus-type potting mix to ensure swift drainage.',
    summary: 'Known as the elephant bush. Highly drought-resilient succulent that features brilliant emerald pads, woody trunks, and rapid growth speed.',
    seasonCare: {
      spring: 'Gradually introduce to direct sunlight outdoors. Fleshy leaves can get sunburned if moved from dark winter rooms directly to hot sun.',
      summer: 'Tolerates extreme heat. Growth accelerates; prune shoots regularly to develop dense evergreen crown pads.',
      autumn: 'Reduce watering dramatically as day length decreases. Move inside prior to cold snaps.',
      winter: 'Water very sparingly (typically once every 3-4 weeks). Place in the absolute brightest window available.'
    }
  },
  {
    id: 'black-pine',
    species: 'Japanese Black Pine',
    scientificName: 'Pinus thunbergii',
    difficulty: 'Advanced',
    placement: 'Outdoor only. Requires full day-long brilliant sunlight. Extremely tough, wind and coastal salt-spray tolerant.',
    watering: 'Needs highly disciplined watering. Enjoys drying out slightly between waterings, but cannot endure dry root-shocks.',
    fertilizing: 'Fertilize with slow-release organic cakes from late spring to autumn to control needle length. Avoid strong spring nitrogen.',
    pruning: 'Requires advanced needle-pluclking and summer decandling. Remove strong terminal candles in mid-summer to promote a secondary flush of shorter needles.',
    repotting: 'Repot every 3 to 4 years in early spring. Roots must maintain some of their native mycorrhiza fungus (looks like white mold) during soil change.',
    summary: 'The king of Japanese coniferous bonsai. Features coarse thick bark, deep dark-green needles, and incredibly powerful, masculine silhouettes.',
    seasonCare: {
      spring: 'Do not decandle yet. Keep in high sun. Prune unwanted buds to direct energy strictly to desired branching zones.',
      summer: 'Crucial decandling season (usually June/July). Cut off active spring spikes to trigger second generation growth of tiny needles.',
      autumn: 'Pluck old needles from previous year to allow light inside. Wire branches to direct growth now that wood is highly flexible.',
      winter: 'Very cold hardy, but protect potted rootball from prolonged hard freezes. Maintain in full winter sun.'
    }
  }
];
