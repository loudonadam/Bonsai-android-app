import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, Sprout, Loader2, Sparkles, Image as ImageIcon, Info } from 'lucide-react';
import { useBonsai } from '../context/BonsaiContext';
import { BonsaiStatus } from '../types';
import { compressImage, extractPhotoMetadata } from '../utils';
import WebcamCapture from './WebcamCapture';

interface AddTreeModalProps {
  onClose: () => void;
}

const COMMON_SPECIES = [
  { name: 'Chinese Elm', style: 'Informal Upright', status: 'Refinement' as BonsaiStatus, age: 5 },
  { name: 'Juniper', style: 'Cascade', status: 'Pre-Bonsai' as BonsaiStatus, age: 6 },
  { name: 'Japanese Maple', style: 'Informal Upright', status: 'Refinement' as BonsaiStatus, age: 8 },
  { name: 'Ficus Retusa', style: 'Double Trunk', status: 'Early Development' as BonsaiStatus, age: 4 },
  { name: 'Dwarf Jade', style: 'Slanting', status: 'Early Development' as BonsaiStatus, age: 3 },
  { name: 'Japanese Black Pine', style: 'Formal Upright', status: 'Mature' as BonsaiStatus, age: 10 },
];

export default function AddTreeModal({ onClose }: AddTreeModalProps) {
  const { addTree, trees = [] } = useBonsai();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [speciesSelectOption, setSpeciesSelectOption] = useState('');
  const [customSpecies, setCustomSpecies] = useState('');
  const species = speciesSelectOption === 'custom' ? customSpecies : speciesSelectOption;
  const [style, setStyle] = useState('');
  const [approxAge, setApproxAge] = useState('');
  const [dateAcquired, setDateAcquired] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<BonsaiStatus>('Pre-Bonsai');
  const [notes, setNotes] = useState('');
  const [photoBase64, setPhotoBase64] = useState('');
  const [fullPhotoBase64, setFullPhotoBase64] = useState('');
  const [extractedMeta, setExtractedMeta] = useState<{ takenAt: string; cameraModel?: string; location?: string } | null>(null);

  // Auxiliary UI States
  const [imageLoading, setImageLoading] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Update species selection without auto-filling other fields
  const handleSpeciesSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSpeciesSelectOption(e.target.value);
  };

  const handleWebcamCapture = async (base64: string, file: File) => {
    setShowWebcam(false);
    setImageLoading(true);
    try {
      // High-resolution full picture (2400px for glorious crisp display)
      const fullRes = await compressImage(file, 2400, 2400, 0.95);
      // High-quality crisp thumbnail (800x800 looks super neat on details lists)
      const thumbRes = await compressImage(file, 800, 800, 0.95);
      
      // Extract EXIF metadata
      const meta = await extractPhotoMetadata(file);
      setExtractedMeta(meta);

      // Auto-prefill the date acquired with date taken
      if (meta.takenAt) {
        setDateAcquired(meta.takenAt);
      }

      setPhotoBase64(thumbRes);
      setFullPhotoBase64(fullRes);
    } catch (error) {
      console.error("Webcam snapshot processing failed:", error);
    } finally {
      setImageLoading(false);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageLoading(true);
    try {
      // High-resolution full picture (2400px for glorious crisp display)
      const fullRes = await compressImage(file, 2400, 2400, 0.95);
      // High-quality crisp thumbnail (800x800 looks super neat on details lists)
      const thumbRes = await compressImage(file, 800, 800, 0.95);
      
      // Extract EXIF metadata
      const meta = await extractPhotoMetadata(file);
      setExtractedMeta(meta);

      // Auto-prefill the date acquired with date taken
      if (meta.takenAt) {
        setDateAcquired(meta.takenAt);
      }

      setPhotoBase64(thumbRes);
      setFullPhotoBase64(fullRes);
    } catch (error) {
      console.error("Image loading/compression failed:", error);
    } finally {
      setImageLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !species || submitting) return;

    setSubmitting(true);
    try {
      const ageNum = approxAge ? parseInt(approxAge) : undefined;
      let computedOriginDate: string | undefined = undefined;
      if (ageNum !== undefined && !isNaN(ageNum)) {
        const today = new Date();
        const originYear = today.getFullYear() - ageNum;
        const originDateObj = new Date(originYear, today.getMonth(), today.getDate());
        computedOriginDate = originDateObj.toISOString().split('T')[0];
      }

      await addTree({
        name,
        species,
        style,
        approximateAge: ageNum,
        originDate: computedOriginDate,
        dateAcquired: dateAcquired || undefined,
        status,
        notes,
        photoBase64: photoBase64 || undefined,
        images: fullPhotoBase64 ? [{
          id: 'img_init_' + Math.random().toString(36).substring(2, 9),
          base64: fullPhotoBase64,
          takenAt: extractedMeta?.takenAt || dateAcquired || new Date().toISOString().split('T')[0],
          isStarred: true,
          cameraModel: extractedMeta?.cameraModel,
          location: extractedMeta?.location
        }] : []
      });
      onClose();
    } catch (e) {
      console.error("Failed to add tree:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#3E4C38]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-[#FDFBF7] border border-natural-cream rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[85vh] overflow-y-auto p-5 sm:p-6 shadow-2xl relative space-y-3.5"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-natural-muted hover:text-natural-forest p-1 rounded-full hover:bg-natural-cream transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-lg font-serif font-bold text-natural-dark flex items-center gap-2">
            <Sprout className="w-5 h-5 text-natural-sage" />
            Register New Bonsai Tree
          </h2>
          <p className="text-[11px] text-natural-muted mt-0.5">Add a new specimen to start logging development.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
          {/* Picture Photo Upload Row */}
          <div className="flex gap-3 items-center p-3 bg-natural-cream/40 rounded-xl border border-natural-cream">
            <div className="relative shrink-0">
              {photoBase64 ? (
                <img
                  src={photoBase64 || undefined}
                  alt="tree preview"
                  className="w-10 h-10 rounded-lg object-cover border border-natural-cream-dark"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-white border border-natural-cream flex items-center justify-center text-natural-muted">
                  {imageLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-natural-forest" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[9px] uppercase font-mono tracking-wider font-bold text-natural-muted block">Tree Portrait</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageLoading}
                  className="px-2.5 py-1 bg-white hover:bg-natural-bg border border-natural-cream text-[10px] font-bold text-natural-forest rounded-lg inline-flex items-center gap-1 transition-all cursor-pointer"
                >
                  <ImageIcon className="w-3 h-3 text-natural-sage" /> Select image file
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={imageLoading}
                  className="px-2.5 py-1 bg-white hover:bg-natural-bg border border-natural-cream text-[10px] font-bold text-natural-forest rounded-lg inline-flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Camera className="w-3 h-3 text-natural-sage" /> Take photo
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              {extractedMeta && (
                <div className="text-[9px] bg-[#EAF0E5] text-natural-forest border border-[#D9E4CE] rounded-lg p-1.5 mt-1 font-mono leading-tight space-y-0.5 max-w-xs">
                  <div className="font-bold flex items-center gap-1 mb-0.5">
                    <Info className="w-2.5 h-2.5 text-natural-sage shrink-0" />
                    <span>EXIF Metadata Extracted:</span>
                  </div>
                  <div>• Taken: {extractedMeta.takenAt}</div>
                </div>
              )}
            </div>
          </div>

          {/* Unified Species selection & prefill options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-natural-forest block">Tree Name / Nickname</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Windswept Sentinel, Ginkgo Twin"
                className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-natural-forest block">Species</label>
              <select
                value={speciesSelectOption}
                onChange={handleSpeciesSelectChange}
                required
                className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
              >
                <option value="" disabled hidden>-- Choose species --</option>
                {(() => {
                  const gardenSpecies = Array.from(new Set(trees.map((t: any) => t.species))).filter(Boolean);
                  const presetSpeciesNames = COMMON_SPECIES.map(item => item.name);
                  const allKnownSpecies = Array.from(new Set([...presetSpeciesNames, ...gardenSpecies])).sort();
                  return allKnownSpecies.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ));
                })()}
                <option value="custom" className="text-natural-clay font-bold font-serif">+ Add Custom / New Species...</option>
              </select>
            </div>
          </div>

          {speciesSelectOption === 'custom' && (
            <div className="space-y-1 animate-fade-in">
              <label className="text-xs font-semibold text-natural-forest block">Type Custom Species Name (Botanical or Common)</label>
              <input
                type="text"
                value={customSpecies}
                onChange={(e) => setCustomSpecies(e.target.value)}
                required
                placeholder="e.g. Acer palmatum, Juniperus chinensis"
                className="w-full bg-white border border-[#D9E4CE] bg-natural-bg/10 rounded-xl px-3 py-1.5 text-xs text-natural-dark focus:outline-none focus:ring-1 focus:ring-natural-sage"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-natural-forest block">Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
              >
                <option value="" disabled hidden>-- Choose style --</option>
                <option value="None">None / Undefined</option>
                <option value="Formal Upright">Formal Upright</option>
                <option value="Informal Upright">Informal Upright</option>
                <option value="Slanting">Slanting</option>
                <option value="Cascade">Cascade</option>
                <option value="Semi-Cascade">Semi-Cascade</option>
                <option value="Windswept">Windswept</option>
                <option value="Double Trunk">Double Trunk</option>
                <option value="Literati">Literati</option>
                <option value="Root-over-Rock">Root-over-Rock</option>
                <option value="Clinging-to-Rock">Clinging-to-Rock</option>
                <option value="Forest / Raft">Forest / Raft</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-natural-forest block">Stage of Development</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BonsaiStatus)}
                className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
              >
                <option value="Pre-Bonsai">Pre-Bonsai</option>
                <option value="Early Development">Early Development</option>
                <option value="Refinement">Refinement</option>
                <option value="Mature">Mature</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-natural-forest block">Approximate Age (years)</label>
              <input
                type="number"
                value={approxAge}
                onChange={(e) => setApproxAge(e.target.value)}
                placeholder="e.g. 6"
                className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-natural-forest block">Acquired Date</label>
              <input
                type="date"
                value={dateAcquired}
                onChange={(e) => setDateAcquired(e.target.value)}
                className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-natural-forest block">Notes & Training Milestones (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. wired principal branches last autumn, needs pruning to promote foliage pads."
              className="w-full bg-white border border-natural-cream rounded-[16px] px-3 py-1.5 text-xs text-natural-dark leading-relaxed"
            />
          </div>

          <div className="flex justify-end gap-3 pt-5 border-t border-natural-cream">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-natural-muted hover:text-natural-forest text-xs font-serif font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-natural-clay hover:bg-natural-clay/90 text-white font-serif font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding Tree...
                </>
              ) : (
                'Add Tree to Garden'
              )}
            </button>
          </div>
        </form>
      </motion.div>

      <AnimatePresence>
        {showWebcam && (
          <WebcamCapture
            onCapture={handleWebcamCapture}
            onClose={() => setShowWebcam(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
