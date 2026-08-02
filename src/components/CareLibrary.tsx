import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Sun, CloudRain, Scissors, Thermometer, Sparkles, 
  Edit, Plus, Trash2, RotateCcw, Save, X, Info, Loader2
} from 'lucide-react';
import { useBonsai } from '../context/BonsaiContext';
import { CareGuide } from '../types';

const renderSkimmableText = (text: string) => {
  if (!text) return null;
  const parts = text.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return <p className="text-xs sm:text-sm text-natural-text leading-relaxed">{text}</p>;
  }
  return (
    <ul className="space-y-1.5 text-xs sm:text-sm text-natural-text leading-relaxed pt-0.5">
      {parts.map((part, idx) => (
        <li key={idx} className="flex items-start gap-1.5">
          <span className="w-1 h-1 rounded-full bg-natural-muted/40 shrink-0 mt-2" />
          <span>{part}</span>
        </li>
      ))}
    </ul>
  );
};

export default function CareLibrary() {
  const { careGuides, updateCareGuide, addCareGuide, deleteCareGuide, resetCareGuides, trees } = useBonsai();
  const [selectedGuide, setSelectedGuide] = useState<CareGuide | null>(null);
  
  // Dialog Toggle States
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Scroll to top whenever a care guide sheet is opened
  useEffect(() => {
    if (selectedGuide) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, [selectedGuide]);

  // Form Fields State
  const [species, setSpecies] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [difficulty, setDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner');
  const [summary, setSummary] = useState('');
  const [placement, setPlacement] = useState('');
  const [watering, setWatering] = useState('');
  const [pruning, setPruning] = useState('');
  const [repotting, setRepotting] = useState('');
  const [springCare, setSpringCare] = useState('');
  const [summerCare, setSummerCare] = useState('');
  const [autumnCare, setAutumnCare] = useState('');
  const [winterCare, setWinterCare] = useState('');

  // AI Generation State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  const startEditing = (guide: CareGuide) => {
    setSpecies(guide.species);
    setScientificName(guide.scientificName);
    setDifficulty(guide.difficulty as any || 'Beginner');
    setSummary(guide.summary);
    setPlacement(guide.placement);
    setWatering(guide.watering);
    setPruning(guide.pruning);
    setRepotting(guide.repotting);
    setSpringCare(guide.seasonCare.spring);
    setSummerCare(guide.seasonCare.summer);
    setAutumnCare(guide.seasonCare.autumn);
    setWinterCare(guide.seasonCare.winter);
    setAiFeedback(null);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedGuide) return;
    const updated: CareGuide = {
      id: selectedGuide.id,
      species: species || 'Unnamed Species',
      scientificName: scientificName || 'Bonsai spec.',
      difficulty,
      summary: summary || 'No summary available.',
      placement: placement || 'No specific placement details.',
      watering: watering || 'No watering details listed.',
      pruning: pruning || 'No pruning instructions customized yet.',
      repotting: repotting || 'No repotting rules specified.',
      seasonCare: {
        spring: springCare || 'Default spring care.',
        summer: summerCare || 'Default summer care.',
        autumn: autumnCare || 'Default autumn care.',
        winter: winterCare || 'Default winter care.'
      }
    };
    await updateCareGuide(selectedGuide.id, updated);
    setSelectedGuide(updated);
    setIsEditing(false);
  };

  const startCreating = () => {
    setSpecies('');
    setScientificName('');
    setDifficulty('Beginner');
    setSummary('');
    setPlacement('');
    setWatering('');
    setPruning('');
    setRepotting('');
    setSpringCare('');
    setSummerCare('');
    setAutumnCare('');
    setWinterCare('');
    setAiFeedback(null);
    setIsCreating(true);
  };

  const handleGenerateCareGuide = async () => {
    if (!species.trim()) {
      setAiFeedback({ type: 'warning', message: 'Please enter a species name first.' });
      return;
    }
    setAiLoading(true);
    setAiFeedback(null);

    try {
      const res = await fetch('/api/gemini/generate-care-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speciesName: species.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to reach care guide service.');
      }

      const data = await res.json();
      const confidence = data.confidence || 'Low';

      if (data.canGenerate && confidence === 'High' && data.data) {
        const g = data.data;
        if (g.species) setSpecies(g.species);
        if (g.scientificName) setScientificName(g.scientificName);
        if (g.difficulty) setDifficulty(g.difficulty);
        if (g.summary) setSummary(g.summary);
        if (g.placement) setPlacement(g.placement);
        if (g.watering) setWatering(g.watering);
        if (g.pruning) setPruning(g.pruning);
        if (g.repotting) setRepotting(g.repotting);
        if (g.seasonCare) {
          if (g.seasonCare.spring) setSpringCare(g.seasonCare.spring);
          if (g.seasonCare.summer) setSummerCare(g.seasonCare.summer);
          if (g.seasonCare.autumn) setAutumnCare(g.seasonCare.autumn);
          if (g.seasonCare.winter) setWinterCare(g.seasonCare.winter);
        }
        setAiFeedback({
          type: 'success',
          message: `High confidence species match! Care sheet auto-generated and filled for review.`
        });
      } else {
        setAiFeedback({
          type: 'warning',
          message: `Confidence level is ${confidence}. ${data.confidenceReason || `Cannot generate verified guide for "${species}".`} Fields left blank for manual editing.`
        });
      }
    } catch (err: any) {
      console.error('Care guide AI error:', err);
      setAiFeedback({
        type: 'error',
        message: err.message || 'Error checking species confidence.'
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreateGuide = async () => {
    const rawData = {
      species: species || 'New Specimen Species',
      scientificName: scientificName || 'Bonsai spec.',
      difficulty,
      summary: summary || 'Custom notes on this guide.',
      placement: placement || 'Prefers bright, indirect light conditions.',
      watering: watering || 'Water thoroughly when topsoil begins to dry.',
      pruning: pruning || 'Regular maintenance styling pruning after spring flushes.',
      repotting: repotting || 'Repot every 2-3 years using a standard porous substrate.',
      seasonCare: {
        spring: springCare || 'Check for new buds. Protect from late frosts.',
        summer: summerCare || 'Water heavily. Provide dappled afternoon shade.',
        autumn: autumnCare || 'Gradually scale down feeds to prepare for hardening.',
        winter: winterCare || 'Protect roots from bitter freezing winds.'
      }
    };
    await addCareGuide(rawData);
    setIsCreating(false);
  };

  const handleDelete = async (guideId: string) => {
    if (window.confirm("Are you sure you want to permanently delete this species care manual?")) {
      await deleteCareGuide(guideId);
      setSelectedGuide(null);
      setIsEditing(false);
    }
  };

  return (
    <div className="space-y-6">
      {!selectedGuide && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-serif font-bold text-natural-dark flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-natural-sage" />
              Bonsai Care Library
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={startCreating}
              className="px-3.5 py-1.5 bg-natural-sage hover:bg-natural-sage/95 text-white rounded-xl text-xs font-serif font-bold transition-all hover:shadow-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> New Care Sheet
            </button>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* CREATE VIEW */}
        {isCreating && (
          <motion.div
            key="create-form"
            className="bg-white border border-natural-cream rounded-[32px] p-6 shadow-sm space-y-5 animate-fade-in"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
          >
            <div className="flex justify-between items-center pb-3 border-b border-natural-cream">
              <h3 className="text-sm font-serif font-bold text-natural-forest uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-natural-sage" /> Create Custom Species Manual
              </h3>
              <button 
                onClick={() => setIsCreating(false)}
                className="text-natural-muted hover:text-natural-forest cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Editing grid fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-natural-forest block">Common Species Name</label>
                  <button
                    type="button"
                    onClick={handleGenerateCareGuide}
                    disabled={aiLoading || !species.trim()}
                    className="px-2.5 py-1 bg-natural-sage/10 hover:bg-natural-sage/20 border border-natural-sage/30 text-natural-forest rounded-lg text-[10px] font-bold font-mono transition-all inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {aiLoading ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-natural-forest" />
                        <span>Checking Confidence...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-natural-sage" />
                        <span>Auto-Fill with AI</span>
                      </>
                    )}
                  </button>
                </div>
                <input 
                  type="text" 
                  value={species}
                  onChange={(e) => setSpecies(e.target.value)}
                  placeholder="e.g. Japanese White Pine"
                  className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-natural-forest block">Scientific / Botanical Name</label>
                <input 
                  type="text" 
                  value={scientificName}
                  onChange={(e) => setScientificName(e.target.value)}
                  placeholder="e.g. Pinus parviflora"
                  className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark font-mono"
                />
              </div>
            </div>

            {aiFeedback && (
              <div className={`p-3 rounded-xl border text-xs font-sans flex items-start gap-2 ${
                aiFeedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                aiFeedback.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-snug">{aiFeedback.message}</div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-natural-forest block">Aesthetic Summary / Description</label>
              <textarea 
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={2}
                placeholder="Brief summary introducing the history, appearance, and styling appeal..."
                className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-natural-forest block">Placement & Light Requirements</label>
                <textarea 
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value)}
                  rows={2}
                  placeholder="Placement rules..."
                  className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-natural-forest block">Watering Requirements</label>
                <textarea 
                  value={watering}
                  onChange={(e) => setWatering(e.target.value)}
                  rows={2}
                  placeholder="Watering schedule & humidity notes..."
                  className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-natural-forest block">Pruning & Styling Strategy</label>
                <textarea 
                  value={pruning}
                  onChange={(e) => setPruning(e.target.value)}
                  rows={2}
                  placeholder="Styling, trimming, and wiring directions..."
                  className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-natural-forest block">Repotting & Soil Mixtures</label>
                <textarea 
                  value={repotting}
                  onChange={(e) => setRepotting(e.target.value)}
                  rows={2}
                  placeholder="Frequencies and substrate recommendations..."
                  className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
                />
              </div>
            </div>

            {/* Seasonal cycles */}
            <div className="space-y-2 pt-2 border-t border-natural-cream/60">
              <h4 className="text-xs font-serif font-bold text-natural-forest uppercase tracking-wider flex items-center gap-1.5">
                <Thermometer className="w-3.5 h-3.5" /> Seasonal Routines
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1 p-3 bg-pink-50/60 rounded-xl border border-pink-200/60">
                  <label className="text-[10px] font-bold text-pink-900 uppercase block">Spring Routine</label>
                  <textarea 
                    value={springCare} 
                    onChange={(e) => setSpringCare(e.target.value)}
                    rows={2} 
                    className="w-full bg-white border border-pink-200/60 text-[11px] rounded p-1 text-pink-950"
                  />
                </div>
                <div className="space-y-1 p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/60">
                  <label className="text-[10px] font-bold text-emerald-900 uppercase block">Summer Routine</label>
                  <textarea 
                    value={summerCare} 
                    onChange={(e) => setSummerCare(e.target.value)}
                    rows={2} 
                    className="w-full bg-white border border-emerald-200/60 text-[11px] rounded p-1 text-emerald-950"
                  />
                </div>
                <div className="space-y-1 p-3 bg-orange-50/60 rounded-xl border border-orange-200/60">
                  <label className="text-[10px] font-bold text-orange-900 uppercase block">Autumn Routine</label>
                  <textarea 
                    value={autumnCare} 
                    onChange={(e) => setAutumnCare(e.target.value)}
                    rows={2} 
                    className="w-full bg-white border border-orange-200/60 text-[11px] rounded p-1 text-orange-950"
                  />
                </div>
                <div className="space-y-1 p-3 bg-sky-50/60 rounded-xl border border-sky-200/60">
                  <label className="text-[10px] font-bold text-sky-900 uppercase block">Winter Routine</label>
                  <textarea 
                    value={winterCare} 
                    onChange={(e) => setWinterCare(e.target.value)}
                    rows={2} 
                    className="w-full bg-white border border-sky-200/60 text-[11px] rounded p-1 text-sky-950"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-natural-cream">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 hover:bg-neutral-50 text-natural-muted font-bold text-[11px] font-serif uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateGuide}
                className="px-5 py-2 bg-natural-sage hover:bg-natural-sage/95 text-white font-serif font-bold text-[11px] rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" /> Save New Care Sheet
              </button>
            </div>
          </motion.div>
        )}

        {/* LIST VIEW */}
        {!selectedGuide && !isCreating && (
          <motion.div 
            key="list"
            className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            {careGuides.map((guide) => {
              const count = trees.filter(t => t.species && t.species.toLowerCase().trim() === guide.species.toLowerCase().trim()).length;
              return (
                <div 
                  key={guide.id}
                  onClick={() => {
                    setSelectedGuide(guide);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="group relative cursor-pointer overflow-hidden rounded-[24px] sm:rounded-[32px] border border-natural-cream bg-white p-5 sm:p-6 shadow-xs transition-all hover:shadow-md hover:border-natural-sage flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="text-base font-serif font-bold text-natural-dark group-hover:text-natural-clay transition-colors">
                        {guide.species}
                      </h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] whitespace-nowrap font-mono font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                          count > 0 
                            ? 'bg-natural-sage/10 text-natural-forest border-natural-sage/20' 
                            : 'bg-stone-50 text-stone-400 border-stone-200'
                        }`}>
                          {count === 0 ? 'None in Garden' : count === 1 ? '1 in Garden' : `${count} in Garden`}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(guide.id);
                          }}
                          className="p-1 border border-stone-200 hover:border-rose-200 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Delete Care Sheet"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs italic text-natural-muted font-mono mt-0.5">{guide.scientificName}</p>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* DETAILED VIEW (OR INLINE DETAILED EDIT VIEW) */}
        {selectedGuide && !isCreating && (
          <motion.div 
            key="detail"
            className="bg-white border border-natural-cream rounded-[24px] sm:rounded-[32px] p-4 sm:p-6 md:p-8 shadow-sm space-y-5 sm:space-y-6"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            {isEditing ? (
              // EDIT MODE LAYOUT
              <div className="space-y-5">
                <div className="pb-3 border-b border-natural-cream flex justify-between items-center">
                  <h3 className="text-sm font-serif font-bold text-natural-forest uppercase tracking-wider flex items-center gap-1.5">
                    <Edit className="w-4 h-4 text-natural-sage" /> Edit: {selectedGuide.species} Care Sheet
                  </h3>
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="text-natural-muted hover:text-natural-forest cursor-pointer p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-natural-forest block">Common Species Name</label>
                      <button
                        type="button"
                        onClick={handleGenerateCareGuide}
                        disabled={aiLoading || !species.trim()}
                        className="px-2.5 py-1 bg-natural-sage/10 hover:bg-natural-sage/20 border border-natural-sage/30 text-natural-forest rounded-lg text-[10px] font-bold font-mono transition-all inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {aiLoading ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-natural-forest" />
                            <span>Checking Confidence...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 text-natural-sage" />
                            <span>Auto-Fill with AI</span>
                          </>
                        )}
                      </button>
                    </div>
                    <input 
                      type="text" 
                      value={species}
                      onChange={(e) => setSpecies(e.target.value)}
                      className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-natural-forest block">Scientific / Botanical Name</label>
                    <input 
                      type="text" 
                      value={scientificName}
                      onChange={(e) => setScientificName(e.target.value)}
                      className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark font-mono"
                    />
                  </div>
                </div>

                {aiFeedback && (
                  <div className={`p-3 rounded-xl border text-xs font-sans flex items-start gap-2 ${
                    aiFeedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                    aiFeedback.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                    'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="leading-snug">{aiFeedback.message}</div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-natural-forest block">Aesthetic Summary / Notes</label>
                  <textarea 
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={2}
                    className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-natural-forest block">Placement & Light Requirements</label>
                    <textarea 
                      value={placement}
                      onChange={(e) => setPlacement(e.target.value)}
                      rows={3}
                      className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-natural-forest block">Watering Requirements</label>
                    <textarea 
                      value={watering}
                      onChange={(e) => setWatering(e.target.value)}
                      rows={3}
                      className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-natural-forest block">Pruning & Styling Strategy</label>
                    <textarea 
                      value={pruning}
                      onChange={(e) => setPruning(e.target.value)}
                      rows={3}
                      className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-natural-forest block">Repotting & Soil Mixtures</label>
                    <textarea 
                      value={repotting}
                      onChange={(e) => setRepotting(e.target.value)}
                      rows={3}
                      className="w-full bg-stone-50 border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
                    />
                  </div>
                </div>

                {/* Seasonal routines */}
                <div className="space-y-2 pt-2 border-t border-natural-cream/60">
                  <h4 className="text-xs font-serif font-bold text-natural-forest uppercase tracking-wider flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5" /> Seasonal Cycles care
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1 p-3 bg-pink-50/60 rounded-xl border border-pink-200/60">
                      <label className="text-[10px] font-bold text-pink-900 uppercase block">Spring Care</label>
                      <textarea 
                        value={springCare} 
                        onChange={(e) => setSpringCare(e.target.value)}
                        rows={3} 
                        className="w-full bg-white border border-pink-200/60 text-[11px] rounded p-1 text-pink-950"
                      />
                    </div>
                    <div className="space-y-1 p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/60">
                      <label className="text-[10px] font-bold text-emerald-900 uppercase block">Summer Care</label>
                      <textarea 
                        value={summerCare} 
                        onChange={(e) => setSummerCare(e.target.value)}
                        rows={3} 
                        className="w-full bg-white border border-emerald-200/60 text-[11px] rounded p-1 text-emerald-950"
                      />
                    </div>
                    <div className="space-y-1 p-3 bg-orange-50/60 rounded-xl border border-orange-200/60">
                      <label className="text-[10px] font-bold text-orange-900 uppercase block">Autumn Care</label>
                      <textarea 
                        value={autumnCare} 
                        onChange={(e) => setAutumnCare(e.target.value)}
                        rows={3} 
                        className="w-full bg-white border border-orange-200/60 text-[11px] rounded p-1 text-orange-950"
                      />
                    </div>
                    <div className="space-y-1 p-3 bg-sky-50/60 rounded-xl border border-sky-200/60">
                      <label className="text-[10px] font-bold text-sky-900 uppercase block">Winter Care</label>
                      <textarea 
                        value={winterCare} 
                        onChange={(e) => setWinterCare(e.target.value)}
                        rows={3} 
                        className="w-full bg-white border border-sky-200/60 text-[11px] rounded p-1 text-sky-950"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-natural-cream">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 hover:bg-neutral-50 text-natural-muted font-bold text-[11px] font-serif uppercase cursor-pointer"
                  >
                    Discard Changes
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-5 py-2 bg-natural-clay hover:bg-natural-clay/95 text-white font-serif font-bold text-[11px] rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Guide Changes
                  </button>
                </div>
              </div>
            ) : (
              // READ-ONLY SPREADSHEEET DETAIL LAYOUT
              <>
                {/* Expanded Header */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4 pb-4 border-b border-natural-cream">
                  <div>
                    <button 
                      onClick={() => setSelectedGuide(null)}
                      className="text-xs font-serif font-bold text-natural-forest hover:text-natural-clay mb-2 block cursor-pointer"
                    >
                      &larr; Back to Care Library
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl sm:text-2xl font-serif font-bold text-natural-dark">
                        {selectedGuide.species}
                      </h3>
                      <span className="px-2.5 py-0.5 bg-stone-100 border border-stone-200 text-stone-600 rounded-lg text-xs font-mono font-medium">
                        {selectedGuide.scientificName}
                      </span>
                      {(() => {
                        const count = trees.filter(t => t.species && t.species.toLowerCase().trim() === selectedGuide.species.toLowerCase().trim()).length;
                        return (
                          <span className={`text-[10px] whitespace-nowrap font-mono font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
                            count > 0 
                              ? 'bg-natural-sage/10 text-natural-forest border-natural-sage/20' 
                              : 'bg-stone-50 text-stone-400 border-stone-200'
                          }`}>
                            {count === 0 ? 'None in Garden' : count === 1 ? '1 in Garden' : `${count} in Garden`}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startEditing(selectedGuide)}
                      className="p-1.5 border border-natural-cream text-natural-muted hover:text-natural-forest hover:bg-stone-50 rounded-xl transition cursor-pointer flex items-center justify-center"
                      title="Edit Sheet Template"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(selectedGuide.id)}
                      className="p-1.5 border border-rose-200 text-rose-500 hover:bg-rose-50 rounded-xl transition cursor-pointer flex items-center justify-center"
                      title="Delete Sheet Template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Care Modules Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-natural-bg/40 border border-natural-cream flex gap-3 items-start">
                    <Sun className="w-5 h-5 text-natural-clay shrink-0 mt-0.5" />
                    <div className="space-y-1 w-full">
                      <h4 className="text-xs font-serif font-bold text-natural-dark uppercase tracking-wider">Placement & Light Requirements</h4>
                      {renderSkimmableText(selectedGuide.placement)}
                    </div>
                  </div>

                  <div className="p-3.5 sm:p-4 rounded-2xl bg-natural-bg/40 border border-natural-cream flex gap-3 items-start">
                    <CloudRain className="w-5 h-5 text-sky-650 shrink-0 mt-0.5" />
                    <div className="space-y-1 w-full">
                      <h4 className="text-xs font-serif font-bold text-natural-dark uppercase tracking-wider">Watering Guidelines</h4>
                      {renderSkimmableText(selectedGuide.watering)}
                    </div>
                  </div>

                  <div className="p-3.5 sm:p-4 rounded-2xl bg-natural-bg/40 border border-natural-cream flex gap-3 items-start">
                    <Scissors className="w-5 h-5 text-natural-forest shrink-0 mt-0.5" />
                    <div className="space-y-1 w-full">
                      <h4 className="text-xs font-serif font-bold text-natural-dark uppercase tracking-wider">Pruning & Styling Strategy</h4>
                      {renderSkimmableText(selectedGuide.pruning)}
                    </div>
                  </div>

                  <div className="p-3.5 sm:p-4 rounded-2xl bg-natural-bg/40 border border-natural-cream flex gap-3 items-start">
                    <Sparkles className="w-5 h-5 text-natural-clay shrink-0 mt-0.5" />
                    <div className="space-y-1 w-full">
                      <h4 className="text-xs font-serif font-bold text-natural-dark uppercase tracking-wider">Repotting & Soil Mix</h4>
                      {renderSkimmableText(selectedGuide.repotting)}
                    </div>
                  </div>
                </div>

                {/* Seasonal Routine Timelines */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-serif font-bold text-natural-dark flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-natural-clay" />
                    Four Seasons Cycle Care
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                    <div className="p-3.5 sm:p-4 border border-pink-200/60 bg-pink-50/50 rounded-2xl space-y-1">
                      <span className="text-[10px] font-bold text-pink-900 uppercase tracking-wider font-mono">Spring Growth</span>
                      {renderSkimmableText(selectedGuide.seasonCare.spring)}
                    </div>
                    <div className="p-3.5 sm:p-4 border border-emerald-200/60 bg-emerald-50/50 rounded-2xl space-y-1">
                      <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider font-mono">Summer Thriving</span>
                      {renderSkimmableText(selectedGuide.seasonCare.summer)}
                    </div>
                    <div className="p-3.5 sm:p-4 border border-orange-200/60 bg-orange-50/50 rounded-2xl space-y-1">
                      <span className="text-[10px] font-bold text-orange-900 uppercase tracking-wider font-mono">Autumn Hardening</span>
                      {renderSkimmableText(selectedGuide.seasonCare.autumn)}
                    </div>
                    <div className="p-3.5 sm:p-4 border border-sky-200/60 bg-sky-50/50 rounded-2xl space-y-1">
                      <span className="text-[10px] font-bold text-sky-900 uppercase tracking-wider font-mono">Winter Dormancy</span>
                      {renderSkimmableText(selectedGuide.seasonCare.winter)}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end items-center pt-4 border-t border-natural-cream">
                  <button 
                    onClick={() => setSelectedGuide(null)}
                    className="px-5 py-2 hover:bg-natural-bg text-natural-forest border border-natural-cream text-xs font-serif font-bold rounded-xl cursor-pointer"
                  >
                    Close Care Sheet
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
