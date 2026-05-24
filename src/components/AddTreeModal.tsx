import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, Sprout, Loader2, Sparkles, Image as ImageIcon } from 'lucide-react';
import { useBonsai } from '../context/BonsaiContext';
import { BonsaiStatus } from '../types';
import { compressImage } from '../utils';

interface AddTreeModalProps {
  onClose: () => void;
}

const COMMON_SPECIES = [
  { name: 'Chinese Elm', style: 'Moyogi (Informal Upright)', status: 'Healthy' as BonsaiStatus, age: 5 },
  { name: 'Juniper', style: 'Kengai (Cascade)', status: 'Healthy' as BonsaiStatus, age: 6 },
  { name: 'Japanese Maple', style: 'Moyogi (Informal Upright)', status: 'Healthy' as BonsaiStatus, age: 8 },
  { name: 'Ficus Retusa', style: 'Sokan (Double Trunk)', status: 'Healthy' as BonsaiStatus, age: 4 },
  { name: 'Dwarf Jade', style: 'Shakan (Slanting)', status: 'Healthy' as BonsaiStatus, age: 3 },
  { name: 'Japanese Black Pine', style: 'Chokkan (Formal Upright)', status: 'Healthy' as BonsaiStatus, age: 10 },
];

export default function AddTreeModal({ onClose }: AddTreeModalProps) {
  const { addTree } = useBonsai();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [style, setStyle] = useState('Moyogi (Informal Upright)');
  const [approxAge, setApproxAge] = useState('');
  const [dateAcquired, setDateAcquired] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<BonsaiStatus>('Healthy');
  const [notes, setNotes] = useState('');
  const [photoBase64, setPhotoBase64] = useState('');

  // Auxiliary UI States
  const [imageLoading, setImageLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Prefill fields based on species select
  const handleSpeciesSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedVal = e.target.value;
    setSpecies(selectedVal);
    
    const preset = COMMON_SPECIES.find(item => item.name === selectedVal);
    if (preset) {
      setStyle(preset.style);
      setStatus(preset.status);
      setApproxAge(preset.age.toString());
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageLoading(true);
    try {
      // Compress to very small dimensions (160x160 JPEG at 0.65 quality ~ 10KB)
      const compressedStr = await compressImage(file, 160, 160, 0.65);
      setPhotoBase64(compressedStr);
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
      await addTree({
        name,
        species,
        style,
        approximateAge: approxAge ? parseInt(approxAge) : undefined,
        dateAcquired: dateAcquired || undefined,
        status,
        notes,
        photoBase64: photoBase64 || undefined
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
        className="bg-[#FDFBF7] border border-natural-cream rounded-[32px] max-w-lg w-full max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative space-y-4"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-natural-muted hover:text-natural-forest p-1 rounded-full hover:bg-natural-cream transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-serif font-bold text-natural-dark flex items-center gap-2">
            <Sprout className="w-5 h-5 text-natural-sage" />
            Register New Bonsai Tree
          </h2>
          <p className="text-xs text-natural-muted mt-0.5">Let’s add a new specimen and start logging developmental milestones.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Picture Photo Upload Row */}
          <div className="flex gap-4 items-center p-4 bg-natural-cream/40 rounded-2xl border border-natural-cream">
            <div className="relative shrink-0">
              {photoBase64 ? (
                <img
                  src={photoBase64}
                  alt="tree preview"
                  className="w-12 h-12 rounded-xl object-cover border border-natural-cream-dark"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-white border border-natural-cream flex items-center justify-center text-natural-muted">
                  {imageLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-natural-forest" />
                  ) : (
                    <Camera className="w-5 h-5" />
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-natural-muted block">Tree Portrait</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageLoading}
                className="px-3 py-1 bg-white hover:bg-natural-bg border border-natural-cream text-[11px] font-bold text-natural-forest rounded-lg inline-flex items-center gap-1 transition-all"
              >
                <ImageIcon className="w-3 h-3 text-natural-sage" /> Select image file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </div>
          </div>

          {/* Quick Species presets selector */}
          <div className="space-y-1">
            <label className="text-xs font-serif font-semibold text-natural-forest flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-natural-clay" />
              Quick Species Profile Presets (Optional)
            </label>
            <select
              onChange={handleSpeciesSelectChange}
              className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
            >
              <option value="">-- Choose profile to prefill --</option>
              {COMMON_SPECIES.map(spec => (
                <option key={spec.name} value={spec.name}>{spec.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <label className="text-xs font-semibold text-natural-forest block">Species (Botanical or Common)</label>
              <input
                type="text"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                required
                placeholder="e.g. Acer palmatum"
                className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-natural-forest block">Bonsai Shape Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
              >
                <option value="Chokkan (Formal Upright)">Chokkan (Formal Upright)</option>
                <option value="Moyogi (Informal Upright)">Moyogi (Informal Upright)</option>
                <option value="Shakan (Slanting)">Shakan (Slanting)</option>
                <option value="Kengai (Cascade)">Kengai (Cascade)</option>
                <option value="Han-Kengai (Semi-Cascade)">Han-Kengai (Semi-Cascade)</option>
                <option value="Fukinagashi (Windswept)">Fukinagashi (Windswept)</option>
                <option value="Sokan (Double Trunk)">Sokan (Double Trunk)</option>
                <option value="Bunjingi (Literati)">Bunjingi (Literati)</option>
                <option value="Seki-joju (Root-over-Rock)">Seki-joju (Root-over-Rock)</option>
                <option value="Sokan forest (Raft style)">Sokan forest (Raft style)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-natural-forest block">Health Status Badge</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BonsaiStatus)}
                className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
              >
                <option value="Healthy">Healthy (Optimal vigor)</option>
                <option value="In Training">In Training (Wiring set)</option>
                <option value="Dormant">Dormant (Winter rest)</option>
                <option value="Recovering">Recovering (Freshly repotted)</option>
                <option value="Stressed">Stressed (Needs watch)</option>
                <option value="Diseased">Diseased (Active care needed)</option>
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
              className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark leading-relaxed"
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
    </div>
  );
}
