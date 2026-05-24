import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, AlertCircle, Sun, CloudRain, Scissors, Thermometer, ShieldAlert, Sparkles } from 'lucide-react';
import { careGuides } from '../careGuides';
import { CareGuide } from '../types';

export default function CareLibrary() {
  const [selectedGuide, setSelectedGuide] = useState<CareGuide | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-serif font-bold text-natural-dark flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-natural-sage" />
          Bonsai Care Library
        </h2>
        <p className="text-xs text-natural-muted">
          Professional guide sheets detailing horticulture, placement, styling, and seasonal routines because correct seasons guide gorgeous trees.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!selectedGuide ? (
          <motion.div 
            key="list"
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            {careGuides.map((guide) => (
              <div 
                key={guide.id}
                onClick={() => setSelectedGuide(guide)}
                className="group relative cursor-pointer overflow-hidden rounded-[32px] border border-natural-cream bg-white p-6 shadow-xs transition-all hover:shadow-md hover:border-natural-sage"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-natural-clay">
                      {guide.difficulty} Difficulty
                    </span>
                    <h3 className="text-lg font-serif font-bold text-natural-dark group-hover:text-natural-clay transition-colors">
                      {guide.species}
                    </h3>
                    <p className="text-xs italic text-natural-muted font-mono mt-0.5">{guide.scientificName}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${
                    guide.difficulty === 'Beginner' 
                      ? 'bg-natural-sage/20 text-natural-forest border border-natural-sage/35' 
                      : guide.difficulty === 'Intermediate'
                      ? 'bg-natural-clay/20 text-[#8C6239] border border-natural-clay/35'
                      : 'bg-rose-500/10 text-rose-700 border border-rose-500/20'
                  }`}>
                    {guide.difficulty}
                  </span>
                </div>
                <p className="text-xs text-natural-text opacity-90 leading-relaxed mt-2 line-clamp-2">
                  {guide.summary}
                </p>
                
                <div className="mt-4 flex items-center justify-between text-[11px] text-natural-muted pt-3 border-t border-natural-cream">
                  <span className="flex items-center gap-1">
                    <Sun className="w-3.5 h-3.5 text-natural-clay" /> Indoor/Outdoor details
                  </span>
                  <span className="text-natural-forest font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-0.5 cursor-pointer">
                    Read Care Sheet &rarr;
                  </span>
                </div>
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div 
            key="detail"
            className="bg-white border border-natural-cream rounded-[32px] p-8 shadow-sm space-y-6"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            {/* Expanded Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 pb-4 border-b border-natural-cream">
              <div>
                <button 
                  onClick={() => setSelectedGuide(null)}
                   className="text-xs font-serif font-bold text-natural-forest hover:text-natural-clay mb-2 block cursor-pointer"
                >
                  &larr; Back to Care Library
                </button>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-serif font-bold text-natural-dark">
                    {selectedGuide.species}
                  </h3>
                  <span className="px-2.5 py-0.5 bg-natural-cream text-natural-muted rounded-lg text-xs font-mono font-medium">
                    {selectedGuide.scientificName}
                  </span>
                </div>
                <p className="text-xs text-natural-muted mt-1">
                  {selectedGuide.summary}
                </p>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
                <span className="text-xs text-natural-muted">Difficulty Rating:</span>
                <span className={`px-3 py-1 rounded-xl text-xs font-bold tracking-wide ${
                  selectedGuide.difficulty === 'Beginner' 
                    ? 'bg-natural-sage/20 text-natural-forest border border-natural-sage/35' 
                    : selectedGuide.difficulty === 'Intermediate'
                    ? 'bg-natural-clay/20 text-[#8C6239] border border-natural-clay/35'
                    : 'bg-rose-500/10 text-rose-700 border border-rose-500/20'
                }`}>
                  {selectedGuide.difficulty}
                </span>
              </div>
            </div>

            {/* Care Modules Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-natural-bg border border-natural-cream flex gap-3.5 items-start">
                <Sun className="w-5 h-5 text-natural-clay shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-serif font-bold text-natural-dark uppercase tracking-wider">Placement & Light Requirements</h4>
                  <p className="text-xs text-natural-text opacity-90 leading-relaxed">{selectedGuide.placement}</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-natural-bg border border-natural-cream flex gap-3.5 items-start">
                <CloudRain className="w-5 h-5 text-sky-650 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-serif font-bold text-natural-dark uppercase tracking-wider">Watering Guidelines</h4>
                  <p className="text-xs text-natural-text opacity-90 leading-relaxed">{selectedGuide.watering}</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-natural-bg border border-natural-cream flex gap-3.5 items-start">
                <Scissors className="w-5 h-5 text-natural-forest shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-serif font-bold text-natural-dark uppercase tracking-wider">Pruning & Styling Strategy</h4>
                  <p className="text-xs text-natural-text opacity-90 leading-relaxed">{selectedGuide.pruning}</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-natural-bg border border-natural-cream flex gap-3.5 items-start">
                <Sparkles className="w-5 h-5 text-natural-clay shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-serif font-bold text-natural-dark uppercase tracking-wider">Repotting & Soil Mix</h4>
                  <p className="text-xs text-natural-text opacity-90 leading-relaxed">{selectedGuide.repotting}</p>
                </div>
              </div>
            </div>

            {/* Seasonal Routine Timelines (Highly premium tactile display) */}
            <div className="space-y-3 pt-2">
              <h4 className="text-sm font-serif font-bold text-natural-dark flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-natural-clay" />
                Four Seasons Cycle Care
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 border border-natural-sage/30 bg-natural-sage/10 rounded-2xl space-y-1">
                  <span className="text-[10px] font-bold text-natural-forest uppercase tracking-wider font-mono">🌸 Spring Growth</span>
                  <p className="text-[11px] leading-relaxed text-natural-dark">{selectedGuide.seasonCare.spring}</p>
                </div>
                <div className="p-4 border border-natural-clay/30 bg-natural-clay/10 rounded-2xl space-y-1">
                  <span className="text-[10px] font-bold text-[#8C6239] uppercase tracking-wider font-mono">☀️ Summer Thriving</span>
                  <p className="text-[11px] leading-relaxed text-[#8C6239]">{selectedGuide.seasonCare.summer}</p>
                </div>
                <div className="p-4 border border-[#E9E5DD] bg-natural-cream/35 rounded-2xl space-y-1">
                  <span className="text-[10px] font-bold text-natural-muted uppercase tracking-wider font-mono">🍂 Autumn Hardening</span>
                  <p className="text-[11px] leading-relaxed text-natural-dark">{selectedGuide.seasonCare.autumn}</p>
                </div>
                <div className="p-4 border-sky-200/40 bg-sky-500/10 rounded-2xl space-y-1">
                  <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider font-mono">❄️ Winter Dormancy</span>
                  <p className="text-[11px] leading-relaxed text-sky-850">{selectedGuide.seasonCare.winter}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-natural-cream">
              <button 
                onClick={() => setSelectedGuide(null)}
                className="px-5 py-2.5 bg-natural-cream hover:bg-natural-cream-dark text-natural-forest text-xs font-serif font-bold rounded-xl cursor-pointer"
              >
                Close Care Sheet
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
