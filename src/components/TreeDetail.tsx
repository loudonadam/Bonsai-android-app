import React, { useState, useRef, useEffect } from 'react';
import { useBonsai } from '../context/BonsaiContext';
import WebcamCapture from './WebcamCapture';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Droplets, 
  Scissors, 
  Sparkles, 
  Sprout, 
  Activity, 
  Bot, 
  LineChart, 
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle,
  HelpCircle,
  Loader2,
  Scale,
  Square,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Camera,
  Award,
  Star,
  Skull,
  X,
  ShieldAlert,
  Image as ImageIcon
} from 'lucide-react';
import { Tree, BonsaiStatus, CareType, Measurement, CareLog, TreePhoto } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import MetricChart from './MetricChart';
import Markdown from 'react-markdown';
import { compressImage, compressBase64Image, extractPhotoMetadata, sanitizeDateString, calculateCurrentAge, formatLocalDate, getTodayLocalDateStr, isDateOverdue } from '../utils';

const COMMON_SPECIES = [
  { name: 'Chinese Elm', style: 'Informal Upright', status: 'Refinement' as BonsaiStatus, age: 5 },
  { name: 'Juniper', style: 'Cascade', status: 'Pre-Bonsai' as BonsaiStatus, age: 6 },
  { name: 'Japanese Maple', style: 'Informal Upright', status: 'Refinement' as BonsaiStatus, age: 8 },
  { name: 'Ficus Retusa', style: 'Double Trunk', status: 'Early Development' as BonsaiStatus, age: 4 },
  { name: 'Dwarf Jade', style: 'Slanting', status: 'Early Development' as BonsaiStatus, age: 3 },
  { name: 'Japanese Black Pine', style: 'Formal Upright', status: 'Mature' as BonsaiStatus, age: 10 },
];

interface TreeDetailProps {
  tree: Tree;
  onBack: () => void;
}

export default function TreeDetail({ tree, onBack }: TreeDetailProps) {
  const { 
    updateTree, 
    deleteTree,
    measurements,
    addMeasurement, 
    updateMeasurement,
    deleteMeasurement,
    careLogs,
    addCareLog, 
    updateCareLog,
    deleteCareLog,
    tasks,
    addTask,
    toggleTask,
    deleteTask,
    careGuides,
    trees = []
  } = useBonsai();

  // Dialog & Modal Triggers
  const [showEditForm, setShowEditForm] = useState(false);
  const [showMForm, setShowMForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [showChoreForm, setShowChoreForm] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isConfirmingDeath, setIsConfirmingDeath] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [lessonNote, setLessonNote] = useState('');
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Edit Tree Fields State
  const [editName, setEditName] = useState(tree.name);
  const [editSpeciesSelectOption, setEditSpeciesSelectOption] = useState('');
  const [editCustomSpecies, setEditCustomSpecies] = useState('');
  const editSpecies = editSpeciesSelectOption === 'custom' ? editCustomSpecies : editSpeciesSelectOption;
  const [editStyle, setEditStyle] = useState(tree.style || '');
  const [editAge, setEditAge] = useState(tree.approximateAge?.toString() || '');
  const [editAcquired, setEditAcquired] = useState(tree.dateAcquired || '');
  const [editNotes, setEditNotes] = useState(tree.notes || '');
  const [showAddAccoladeForm, setShowAddAccoladeForm] = useState(false);
  const [accoladeTitle, setAccoladeTitle] = useState('');
  const [accoladeDate, setAccoladeDate] = useState(getTodayLocalDateStr());
  const [accoladePhoto, setAccoladePhoto] = useState('');
  const [accoladePhotoLoading, setAccoladePhotoLoading] = useState(false);

  // Initialize edit fields when edit modal opens
  useEffect(() => {
    if (showEditForm) {
      const s = tree.species || '';
      const presetNames = COMMON_SPECIES.map(x => x.name);
      const gardenNames = trees.map((t: any) => t.species).filter(Boolean);
      const allKnown = new Set([...presetNames, ...gardenNames]);
      if (s && allKnown.has(s)) {
        setEditSpeciesSelectOption(s);
        setEditCustomSpecies('');
      } else {
        setEditSpeciesSelectOption(s ? 'custom' : '');
        setEditCustomSpecies(s);
      }
      setEditName(tree.name);
      setEditStyle(tree.style || '');
      setEditAge(tree.approximateAge?.toString() || '');
      setEditAcquired(tree.dateAcquired || '');
      setEditNotes(tree.notes || '');
    }
  }, [showEditForm, tree, trees]);

  // Log Width Fields State
  const [logWidth, setLogWidth] = useState('');
  const [logMDate, setLogMDate] = useState(getTodayLocalDateStr());
  const [logMNotes, setLogMNotes] = useState('');

  // Log Care Fields State
  const [careType, setCareType] = useState<CareType>('Watering');
  const [careDate, setCareDate] = useState(getTodayLocalDateStr());
  const [careNotes, setCareNotes] = useState('');

  // Log Chore Fields State
  const [choreTitle, setChoreTitle] = useState('');
  const [choreType, setChoreType] = useState('Wire');
  const [choreDueDate, setChoreDueDate] = useState(getTodayLocalDateStr());

  // Edit Measurement State
  const [editingMeasurementId, setEditingMeasurementId] = useState<string | null>(null);
  const [editMWidth, setEditMWidth] = useState('');
  const [editMDate, setEditMDate] = useState('');
  const [editMNotes, setEditMNotes] = useState('');

  // Dynamic Task Inline Confirmations State
  const [confirmingTaskId, setConfirmingTaskId] = useState<string | null>(null);
  const [confirmingActionType, setConfirmingActionType] = useState<'complete' | 'uncomplete' | 'delete' | null>(null);

  const handleToggleTaskDirect = async (taskId: string, currentCompleted: boolean) => {
    try {
      await toggleTask(tree.id, taskId, !currentCompleted);
    } catch (err) {
      console.error("Failed to toggle task in TreeDetail:", err);
    }
  };

  const triggerConfirmTaskAction = (taskId: string, actionType: 'complete' | 'uncomplete' | 'delete') => {
    setConfirmingTaskId(taskId);
    setConfirmingActionType(actionType);
  };

  const handleConfirmTaskAction = async (taskId: string, isCompleted: boolean) => {
    if (!confirmingActionType) return;
    try {
      if (confirmingActionType === 'complete' || confirmingActionType === 'uncomplete') {
        await toggleTask(tree.id, taskId, isCompleted);
      } else if (confirmingActionType === 'delete') {
        await deleteTask(tree.id, taskId);
      }
    } catch (err) {
      console.error("Failed to commit task action inside TreeDetail:", err);
    } finally {
      setConfirmingTaskId(null);
      setConfirmingActionType(null);
    }
  };

  // Edit Care Log State
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editLogType, setEditLogType] = useState('');
  const [editLogDate, setEditLogDate] = useState('');
  const [editLogNotes, setEditLogNotes] = useState('');

  // Gemini Consultation AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDiagnosis, setAiDiagnosis] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [isMLogExpanded, setIsMLogExpanded] = useState(false);
  const [isWorkExpanded, setIsWorkExpanded] = useState(false);

  // Photo Webcam Capture states
  const [showCarouselWebcam, setShowCarouselWebcam] = useState(false);
  const [showRecordCareWebcam, setShowRecordCareWebcam] = useState(false);

  // Expanded Record Care workflow states
  const [carePhotoBase64, setCarePhotoBase64] = useState<string>('');
  const [careFullPhotoBase64, setCareFullPhotoBase64] = useState<string>('');
  const [careExtractedMeta, setCareExtractedMeta] = useState<{ takenAt: string; cameraModel?: string; location?: string } | null>(null);
  const [carePhotoLoading, setCarePhotoLoading] = useState(false);

  const [careWidth, setCareWidth] = useState('');
  const [careMNotes, setCareMNotes] = useState('');
  const [careWidthEnabled, setCareWidthEnabled] = useState(false);

  const [careChoreEnabled, setCareChoreEnabled] = useState(false);
  const [careChoreTitle, setCareChoreTitle] = useState('');
  const [careChoreType, setCareChoreType] = useState('Watering');
  const [careChoreDueDate, setCareChoreDueDate] = useState(new Date().toISOString().split('T')[0]);

  const fileInputRefRecordCare = useRef<HTMLInputElement>(null);
  const cameraInputRefRecordCare = useRef<HTMLInputElement>(null);

  // Retrieve tree records safely or fall back to empty array
  const treeMeasurements = (measurements[tree.id] || []).filter(m => m.width !== 0);
  const treeLogs = careLogs[tree.id] || [];
  const treeTasks = tasks[tree.id] || [];

  const handleUpdateTree = async (e: React.FormEvent) => {
    e.preventDefault();
    const ageNum = editAge ? parseInt(editAge) : undefined;
    let computedOriginDate: string | undefined = undefined;
    if (ageNum !== undefined && !isNaN(ageNum)) {
      if (ageNum === tree.approximateAge && tree.originDate) {
        computedOriginDate = tree.originDate;
      } else {
        const today = new Date();
        const originYear = today.getFullYear() - ageNum;
        const originDateObj = new Date(originYear, today.getMonth(), today.getDate());
        computedOriginDate = originDateObj.toISOString().split('T')[0];
      }
    }

    await updateTree(tree.id, {
      name: editName,
      species: editSpecies,
      style: editStyle,
      approximateAge: ageNum,
      originDate: computedOriginDate,
      dateAcquired: editAcquired || undefined,
      notes: editNotes,
    });
    setShowEditForm(false);
  };

  const handleStatusChange = async (newStatus: BonsaiStatus) => {
    await updateTree(tree.id, { status: newStatus });
  };

  const normalizedAccolades = tree.accoladesList || (tree.accolades ? [{ id: 'legacy', title: tree.accolades, date: tree.dateAcquired || new Date().toISOString().split('T')[0] }] : []);

  const handleAddAccoladeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accoladeTitle.trim()) return;

    const newAccolade = {
      id: Math.random().toString(36).substr(2, 9),
      title: accoladeTitle.trim(),
      date: accoladeDate || new Date().toISOString().split('T')[0],
      photoBase64: accoladePhoto || undefined,
    };

    const nextList = [...normalizedAccolades, newAccolade];
    await updateTree(tree.id, { 
      accoladesList: nextList,
      accolades: undefined 
    });

    setAccoladeTitle('');
    setAccoladeDate(new Date().toISOString().split('T')[0]);
    setAccoladePhoto('');
    setShowAddAccoladeForm(false);
  };

  const handleDeleteAccolade = async (accoladeId: string) => {
    if (window.confirm("Are you sure you want to permanently delete this award/recognition?")) {
      const nextList = normalizedAccolades.filter(a => a.id !== accoladeId);
      await updateTree(tree.id, { 
        accoladesList: nextList,
        accolades: undefined
      });
    }
  };

  const handleAccoladePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAccoladePhotoLoading(true);
    try {
      const thumbResStr = await compressImage(file, 1200, 1200, 0.85);
      setAccoladePhoto(thumbResStr);
    } catch (err) {
      console.error("Failed to process accolade photo upload:", err);
    } finally {
      setAccoladePhotoLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  // Photo Carousel State and Operations
  const getMostRecentPhotoIndex = (photoList: TreePhoto[]) => {
    if (photoList.length <= 1) return 0;
    let latestIdx = 0;
    let latestTime = 0;
    photoList.forEach((p, idx) => {
      const t = new Date(p.takenAt).getTime();
      if (!isNaN(t) && t > latestTime) {
        latestTime = t;
        latestIdx = idx;
      }
    });
    return latestIdx;
  };

  const [localPhotos, setLocalPhotos] = useState<Record<string, string>>({});
  const [carouselImageIndex, setCarouselImageIndex] = useState(0);
  const [carouselLoading, setCarouselLoading] = useState(false);
  const fileInputRefCarousel = useRef<HTMLInputElement>(null);
  const cameraInputRefCarousel = useRef<HTMLInputElement>(null);

  // Normalized photo history extractor:
  const getNormalizedPhotos = (): TreePhoto[] => {
    const list: TreePhoto[] = [];
    const fallbackDate = tree.dateAcquired || new Date().toISOString().split('T')[0];
    if (tree.images && Array.isArray(tree.images) && tree.images.length > 0) {
      tree.images.forEach((img, idx) => {
        if (!img) return;
        if (typeof img === 'string') {
          list.push({
            id: `legacy-${idx}-${tree.id}`,
            base64: img,
            takenAt: sanitizeDateString(fallbackDate, fallbackDate),
            isStarred: idx === 0
          });
        } else {
          // Robust Fallback: If this specific image has an empty/missing base64, but is the starred/primary
          // photo or the very first chronological photo, fall back to tree.photoBase64 if available so the
          // user sees the main image instantly instead of a loading spinner during lazy hydration.
          let b64 = img.base64 || localPhotos[img.id] || '';
          if (!b64 && (img.isStarred || idx === 0) && tree.photoBase64) {
            b64 = tree.photoBase64;
          }
          list.push({
            ...img,
            base64: b64,
            takenAt: sanitizeDateString(img.takenAt, fallbackDate)
          });
        }
      });
    } else if (tree.photoBase64) {
      list.push({
        id: `init-${tree.id}`,
        base64: tree.photoBase64,
        takenAt: sanitizeDateString(fallbackDate, fallbackDate),
        isStarred: true
      });
    }
    return list;
  };

  // Hydrate all image base64 data from IndexedDB for the current tree
  useEffect(() => {
    let active = true;
    const hydratePhotos = async () => {
      try {
        const { getPhotoLocal } = await import('../utils/idb');
        const nextLocalPhotos: Record<string, string> = {};
        
        if (tree.images && Array.isArray(tree.images)) {
          for (const img of tree.images) {
            if (typeof img === 'object' && img !== null && img.id && !img.base64) {
              const b64 = await getPhotoLocal(img.id);
              if (b64) {
                nextLocalPhotos[img.id] = b64;
              }
            }
          }
        }
        
        if (active && Object.keys(nextLocalPhotos).length > 0) {
          setLocalPhotos(prev => ({ ...prev, ...nextLocalPhotos }));
        }
      } catch (err) {
        console.error("Failed to hydrate photos in TreeDetail:", err);
      }
    };

    hydratePhotos();
    return () => {
      active = false;
    };
  }, [tree.id, tree.images]);

  const photos = getNormalizedPhotos();
  const activePhoto = photos[carouselImageIndex] || photos[0] || null;

  // On-demand instant hydration for the currently active/selected photo
  useEffect(() => {
    if (activePhoto && activePhoto.id && !activePhoto.base64 && !localPhotos[activePhoto.id]) {
      let active = true;
      import('../utils/idb').then(({ getPhotoLocal }) => {
        getPhotoLocal(activePhoto.id).then(b64 => {
          if (active && b64) {
            setLocalPhotos(prev => ({ ...prev, [activePhoto.id]: b64 }));
          }
        });
      });
      return () => { active = false; };
    }
  }, [activePhoto?.id, activePhoto?.base64]);

  useEffect(() => {
    const list = getNormalizedPhotos();
    setCarouselImageIndex(getMostRecentPhotoIndex(list));
    window.scrollTo(0, 0);
  }, [tree.id, tree.images?.length]);

  const handlePhotoUploadAndUpdate = async (nextPhotos: TreePhoto[]) => {
    // Ensure every photo in nextPhotos has a non-empty base64 string
    const fullyPopulatedPhotos = nextPhotos.map((p, idx) => {
      let b64 = p.base64;
      if (!b64) {
        const foundInPhotos = photos.find(existingP => existingP.id === p.id);
        b64 = foundInPhotos?.base64 || localPhotos[p.id] || (idx === 0 || p.isStarred ? tree.photoBase64 : '') || '';
      }
      return { ...p, base64: b64 };
    });

    // Locate starred photo or locate highest precedence dated photo (the most recent)
    const sorted = [...fullyPopulatedPhotos].sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime());
    const starredPhoto = fullyPopulatedPhotos.find(p => p.isStarred);
    const activePhotoToThumb = starredPhoto || sorted[0];

    let thumb = '';
    if (activePhotoToThumb && activePhotoToThumb.base64) {
      try {
        // Create an optimized crisp 800x800 thumbnail for the collection dashboard
        thumb = await compressBase64Image(activePhotoToThumb.base64, 800, 800, 0.95);
      } catch (err) {
        thumb = activePhotoToThumb.base64;
      }
    }

    await updateTree(tree.id, {
      photoBase64: thumb || undefined,
      images: fullyPopulatedPhotos
    });
  };

  const handleAddCarouselImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCarouselLoading(true);
    try {
      // Extract EXIF tags
      const meta = await extractPhotoMetadata(file);

      // Compress to a gorgeous high-fidelity full-scale representation for the viewer
      const fullResStr = await compressImage(file, 2400, 2400, 0.95);
      
      const newPhoto: TreePhoto = {
        id: 'photo_' + Math.random().toString(36).substring(2, 9),
        base64: fullResStr,
        takenAt: meta.takenAt || new Date().toISOString().split('T')[0],
        cameraModel: meta.cameraModel,
        location: meta.location,
        isStarred: false
      };

      const updatedPhotos = [...photos, newPhoto];
      await handlePhotoUploadAndUpdate(updatedPhotos);
      setCarouselImageIndex(updatedPhotos.length - 1);
    } catch (err) {
      console.error("Failed to append image to specimens directory:", err);
    } finally {
      setCarouselLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete ${tree.name}? This will remove all associated logs and tree tracking history.`)) {
      await deleteTree(tree.id);
      onBack();
    }
  };

  const handleAddMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(logWidth);
    if (!w || !logMDate) return;

    await addMeasurement(tree.id, w, logMDate, logMNotes);
    
    // Reset Log State
    setLogWidth('');
    setLogMNotes('');
    setShowMForm(false);
  };

  const handleCarouselWebcamCapture = async (base64: string, file: File) => {
    setShowCarouselWebcam(false);
    setCarouselLoading(true);
    try {
      const meta = await extractPhotoMetadata(file);
      const fullResStr = await compressImage(file, 2400, 2400, 0.95);
      
      const newPhoto: TreePhoto = {
        id: 'photo_' + Math.random().toString(36).substring(2, 9),
        base64: fullResStr,
        takenAt: meta.takenAt || new Date().toISOString().split('T')[0],
        cameraModel: meta.cameraModel,
        location: meta.location,
        isStarred: false
      };

      const updatedPhotos = [...photos, newPhoto];
      await handlePhotoUploadAndUpdate(updatedPhotos);
      setCarouselImageIndex(updatedPhotos.length - 1);
    } catch (err) {
      console.error("Failed to append webcam image to specimens directory:", err);
    } finally {
      setCarouselLoading(false);
    }
  };

  const handleRecordCareWebcamCapture = async (base64: string, file: File) => {
    setShowRecordCareWebcam(false);
    setCarePhotoLoading(true);
    try {
      const meta = await extractPhotoMetadata(file);
      const fullResStr = await compressImage(file, 2400, 2400, 0.95);
      const thumbResStr = await compressImage(file, 800, 800, 0.95);
      
      setCarePhotoBase64(thumbResStr);
      setCareFullPhotoBase64(fullResStr);
      setCareExtractedMeta(meta);
    } catch (err) {
      console.error("Failed to process Record Care snapshot:", err);
    } finally {
      setCarePhotoLoading(false);
    }
  };

  const handleRecordCarePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCarePhotoLoading(true);
    try {
      const meta = await extractPhotoMetadata(file);
      const fullResStr = await compressImage(file, 2400, 2400, 0.95);
      const thumbResStr = await compressImage(file, 800, 800, 0.95);
      
      setCarePhotoBase64(thumbResStr);
      setCareFullPhotoBase64(fullResStr);
      setCareExtractedMeta(meta);
    } catch (err) {
      console.error("Failed to process uploaded Record Care photo:", err);
    } finally {
      setCarePhotoLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleAddCareLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!careDate) return;

    // 1) Write core care note
    await addCareLog(tree.id, 'Care Work' as CareType, careDate, careNotes);

    // 2) Optional Photo Upload
    if (careFullPhotoBase64) {
      const newPhoto: TreePhoto = {
        id: 'photo_' + Math.random().toString(36).substring(2, 9),
        base64: careFullPhotoBase64,
        takenAt: careExtractedMeta?.takenAt || careDate || new Date().toISOString().split('T')[0],
        cameraModel: careExtractedMeta?.cameraModel,
        location: careExtractedMeta?.location,
        isStarred: false
      };
      const updatedPhotos = [...photos, newPhoto];
      await handlePhotoUploadAndUpdate(updatedPhotos);
      setCarouselImageIndex(updatedPhotos.length - 1);
    }

    // 3) Optional Measurement log
    if (careWidthEnabled && careWidth) {
      const w = parseFloat(careWidth);
      if (w) {
        await addMeasurement(tree.id, w, careDate, careMNotes || `Logged during Record Care: ${careNotes}`);
      }
    }

    // 4) Optional Upcoming Chore / Task logging
    if (careChoreEnabled && careChoreTitle) {
      await addTask(tree.id, careChoreTitle, careChoreType, careChoreDueDate);
    }

    // Reset workflow states
    setCareNotes('');
    setCarePhotoBase64('');
    setCareFullPhotoBase64('');
    setCareExtractedMeta(null);
    setCareWidth('');
    setCareMNotes('');
    setCareWidthEnabled(false);
    setCareChoreEnabled(false);
    setCareChoreTitle('');
    setCareChoreType('Watering');
    setCareChoreDueDate(new Date().toISOString().split('T')[0]);
    setShowLogForm(false);
  };

  const handleStartEditMeasurement = (m: Measurement) => {
    setEditingMeasurementId(m.id);
    setEditMWidth(m.width.toString());
    setEditMDate(m.date);
    setEditMNotes(m.notes || '');
  };

  const handleSaveEditMeasurement = async (e: React.FormEvent, mId: string) => {
    e.preventDefault();
    const w = parseFloat(editMWidth);
    if (!w || !editMDate) return;
    await updateMeasurement(tree.id, mId, w, editMDate, editMNotes);
    setEditingMeasurementId(null);
  };

  const handleStartEditCareLog = (log: CareLog) => {
    setEditingLogId(log.id);
    setEditLogType(log.type);
    setEditLogDate(log.date);
    setEditLogNotes(log.notes || '');
  };

  const handleSaveEditCareLog = async (e: React.FormEvent, logId: string) => {
    e.preventDefault();
    if (!editLogDate || !editLogType) return;
    await updateCareLog(tree.id, logId, editLogType, editLogDate, editLogNotes);
    setEditingLogId(null);
  };

  const handleAddChore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!choreTitle || !choreDueDate) return;
    await addTask(tree.id, choreTitle, choreType, choreDueDate);
    
    // Clear out form inputs completely & collapse container
    setChoreTitle('');
    setChoreType('Wire');
    setChoreDueDate(new Date().toISOString().split('T')[0]);
    setShowChoreForm(false);
  };

  // Consult the AI Consultant (Gemini Route Proxy)
  const consultBonsaiMaster = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiDiagnosis(null);

    try {
      // Find a matching care guide if any exists
      const treeSpecies = (tree.species || '').trim().toLowerCase();
      const matchedGuide = treeSpecies ? careGuides.find(g => {
        const gSpecies = (g.species || '').toLowerCase();
        const gScientific = (g.scientificName || '').toLowerCase();
        return gSpecies.includes(treeSpecies) || treeSpecies.includes(gSpecies) || 
               gScientific.includes(treeSpecies) || treeSpecies.includes(gScientific);
      }) : undefined;

      // Pack photos with dates and base64 for the top 2 images (reducing payload size while keeping progression)
      const sortedPhotos = [...photos].sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime());
      
      const payloadPhotos = sortedPhotos.map((p, idx) => ({
        takenAt: p.takenAt,
        cameraModel: p.cameraModel,
        imageBase64: idx < 2 ? p.base64 : undefined,
        isMostRecent: idx === 0,
      }));

      const payloadMeasurements = [...treeMeasurements]
        .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map(m => ({ date: m.date, width: m.width, notes: m.notes }));

      const payloadLogs = [...treeLogs]
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map(l => ({ date: l.date, notes: l.notes }));

      const response = await fetch('/api/gemini/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tree.name,
          species: tree.species,
          style: tree.style,
          status: tree.status,
          age: tree.approximateAge,
          dateAcquired: tree.dateAcquired,
          notes: tree.notes,
          photos: payloadPhotos,
          measurements: payloadMeasurements,
          careLogs: payloadLogs,
          careGuide: matchedGuide,
        }),
      });

      if (!response.ok) {
        throw new Error('Trouble talking to the AI Consultant.');
      }

      const data = await response.json();
      setAiDiagnosis(data.analysis);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Consultation failed. Check dev logs.');
    } finally {
      setAiLoading(false);
    }
  };

  // Icon mapping helpers
  const getCareIcon = (type: CareType) => {
    switch (type) {
      case 'Watering': 
        return <Droplets className="w-4 h-4 text-sky-505 shrink-0" />;
      case 'Pruning': 
      case 'Styling':
        return <Scissors className="w-4 h-4 text-natural-forest shrink-0" />;
      case 'Fertilizing': 
        return <Sparkles className="w-4 h-4 text-natural-clay shrink-0" />;
      case 'Repotting': 
        return <Sprout className="w-4 h-4 text-natural-sage shrink-0" />;
      default: 
        return <Calendar className="w-4 h-4 text-natural-muted shrink-0" />;
    }
  };

  const getStatusBadgeStyles = (status: BonsaiStatus) => {
    switch (status) {
      case 'Pre-Bonsai': return 'bg-amber-50 text-amber-800 border border-amber-200';
      case 'Early Development': return 'bg-sky-50 text-sky-700 border border-sky-150';
      case 'Refinement': return 'bg-teal-50 text-teal-800 border border-teal-200';
      case 'Mature': return 'bg-violet-50 text-violet-750 border border-violet-150';
      default: return 'bg-neutral-50 text-neutral-600 border border-neutral-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Primary Tree Header Block */}
      <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center p-6 bg-white border border-natural-cream rounded-[32px] shadow-sm">
        <div className="space-y-1 w-full flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-serif font-bold text-natural-dark">{tree.name}</h1>
            <div className="relative">
              <select
                value={tree.status}
                onChange={(e) => handleStatusChange(e.target.value as BonsaiStatus)}
                className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold tracking-wide uppercase border border-transparent cursor-pointer hover:border-natural-sage transition-all focus:outline-none ${getStatusBadgeStyles(tree.status)}`}
                title="Change Development Stage"
              >
                <option value="Pre-Bonsai">Pre-Bonsai</option>
                <option value="Early Development">Early Development</option>
                <option value="Refinement">Refinement</option>
                <option value="Mature">Mature</option>
              </select>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-natural-muted font-semibold">
            <span className="text-natural-forest font-bold font-serif">{tree.species}</span>
            <span>&bull;</span>
            <span className="italic">{tree.style || 'No styling declared'}</span>
            {calculateCurrentAge(tree) !== undefined && (
              <>
                <span>&bull;</span>
                <span>~{calculateCurrentAge(tree)} yrs</span>
              </>
            )}
            {tree.dateAcquired && (
              <>
                <span>&bull;</span>
                <span>Acquired: {formatLocalDate(tree.dateAcquired, { year: 'numeric', month: 'short' })}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Visual Development History Carousel */}
      <div className="p-6 bg-white border border-natural-cream rounded-[32px] shadow-sm space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-natural-cream/40">
          <div>
            <h3 className="text-xs font-serif font-bold text-natural-forest uppercase tracking-wider flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-natural-sage" />
              Photo Timeline
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRefCarousel.current?.click()}
              disabled={carouselLoading}
              className="p-1 px-1.5 hover:bg-natural-bg/50 border border-transparent hover:border-natural-cream text-natural-forest hover:text-natural-clay transition-all rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50"
              title="Select File"
            >
              <Plus className="w-4 h-4" />
            </button>
            <span className="text-zinc-300 text-[10px]">|</span>
            <button
              type="button"
              onClick={() => cameraInputRefCarousel.current?.click()}
              disabled={carouselLoading}
              className="p-1 px-1.5 hover:bg-natural-bg/50 border border-transparent hover:border-natural-cream text-natural-forest hover:text-natural-clay transition-all rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50"
              title="Take Photo"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRefCarousel}
              type="file"
              accept="image/*"
              onChange={handleAddCarouselImage}
              className="hidden"
            />
            <input
              ref={cameraInputRefCarousel}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleAddCarouselImage}
              className="hidden"
            />
          </div>
        </div>

        {carouselLoading && (
          <div className="py-12 flex flex-col items-center justify-center gap-2 border border-dashed border-natural-cream rounded-2xl bg-natural-bg/25">
            <Loader2 className="w-6 h-6 animate-spin text-natural-sage" />
            <span className="text-[11px] font-mono font-bold text-natural-muted">Compressing and registering photo...</span>
          </div>
        )}

        {!carouselLoading && photos.length === 0 ? (
          <div 
            className="group py-12 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-natural-cream/60 rounded-[32px] bg-[#FAF9F5] animate-fade-in"
          >
            <div className="p-3 bg-white rounded-full border border-natural-cream shadow-xs text-natural-muted group-hover:text-natural-forest transition-all">
              <Camera className="w-5 h-5 text-natural-sage" />
            </div>
            <span className="text-xs font-serif font-bold text-natural-dark mt-1">No historical portrait collection yet</span>
            <span className="text-[10.5px] text-zinc-400 mb-2">Select a file from your device or capture a live webcam portrait.</span>
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRefCarousel.current?.click()}
                className="px-4 py-1.5 bg-white hover:bg-stone-50 border border-natural-cream text-[10px] font-bold font-mono tracking-wider uppercase text-natural-forest rounded-xl transition cursor-pointer"
              >
                Browse File
              </button>
              <button
                onClick={() => cameraInputRefCarousel.current?.click()}
                className="px-4 py-1.5 bg-white hover:bg-stone-50 border border-natural-cream text-[10px] font-bold font-mono tracking-wider uppercase text-natural-forest rounded-xl transition cursor-pointer flex items-center gap-1"
              >
                <Camera className="w-3.5 h-3.5" /> Live Camera
              </button>
            </div>
          </div>
        ) : !carouselLoading && activePhoto && (
          <div className="space-y-4 animate-fade-in">
            {/* Main Interactive Viewing Area */}
            <div 
              onClick={() => setIsViewerOpen(true)}
              className="relative aspect-[4/3] md:aspect-[3/2] lg:aspect-[4/3] max-h-80 md:max-h-[550px] lg:max-h-[700px] w-full rounded-2xl overflow-hidden border border-natural-cream group bg-neutral-900/5 flex items-center justify-center shadow-inner cursor-pointer hover:border-natural-sage transition-all"
              title="Click to enlarge into fullscreen viewer"
            >
              {activePhoto.base64 ? (
                <img
                  src={activePhoto.base64 || undefined}
                  alt={`${tree.name} growth stage`}
                  className="max-w-full max-h-full object-contain mx-auto select-none bg-neutral-950/5 animate-fade-in"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-natural-sage/40 gap-1.5 p-4">
                  <Loader2 className="w-8 h-8 animate-spin text-natural-sage" />
                  <span className="text-[9px] font-mono font-bold tracking-wider uppercase text-natural-muted">Hydrating Image...</span>
                </div>
              )}

              {/* Navigation overlays */}
              {photos.length > 1 && (
                <>
                  <button
                    disabled={carouselImageIndex === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (carouselImageIndex > 0) {
                        setCarouselImageIndex(carouselImageIndex - 1);
                      }
                    }}
                    className={`absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/75 hover:bg-white text-natural-forest shadow-md border border-natural-cream hover:scale-105 transition-all cursor-pointer ${
                      carouselImageIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'opacity-80 hover:opacity-100'
                    }`}
                    title="Previous Photo"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={carouselImageIndex === photos.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (carouselImageIndex < photos.length - 1) {
                        setCarouselImageIndex(carouselImageIndex + 1);
                      }
                    }}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/75 hover:bg-white text-natural-forest shadow-md border border-natural-cream hover:scale-105 transition-all cursor-pointer ${
                      carouselImageIndex === photos.length - 1 ? 'opacity-30 cursor-not-allowed' : 'opacity-80 hover:opacity-100'
                    }`}
                    title="Next Photo"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}

            </div>

            {/* Carousel navigation strip */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-natural-bg/30 p-2.5 rounded-xl border border-natural-cream/45 w-full">
              <div className="flex flex-col items-start gap-0.5 text-left w-full sm:w-auto shrink-0 max-w-full sm:max-w-xs">
                <span className="text-[10px] font-mono font-bold text-natural-muted uppercase tracking-wider">
                  Photo {carouselImageIndex + 1} of {photos.length}
                </span>
                <span className="text-[11px] text-natural-forest font-bold">
                  Date Taken: {(() => {
                    try {
                      return new Date(activePhoto.takenAt + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
                    } catch {
                      return activePhoto.takenAt;
                    }
                  })()}
                </span>

              </div>

              {/* Miniature indicator thumbnail row */}
              <div className="flex items-center gap-1.5 max-w-full overflow-x-auto py-1 px-0.5 scrollbar-thin">
                {photos.map((p, idx) => (
                  <button
                    key={p.id}
                    onClick={() => setCarouselImageIndex(idx)}
                    className={`relative w-14 h-14 rounded-lg overflow-hidden shrink-0 transition-all border cursor-pointer ${
                      carouselImageIndex === idx 
                        ? 'border-natural-sage ring-2 ring-natural-sage/30 scale-105' 
                        : 'border-natural-cream opacity-80 hover:opacity-100'
                    }`}
                  >
                    {p.base64 ? (
                      <img 
                        src={p.base64 || undefined} 
                        alt="Thumbnail indicator" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#FCFAF5] flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-natural-sage/40" />
                      </div>
                    )}
                    {p.isStarred && (
                      <div className="absolute top-0 right-0 p-0.5 bg-amber-500 text-neutral-950 rounded-bl-md">
                        <Star className="w-2 h-2 fill-current" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FULL RESOLUTION HIGH QUALITY BACKDROP BLURRED LIGHTBOX VIEWPLAY OUTFIT */}
      {isViewerOpen && activePhoto && (
        <div className="fixed inset-0 bg-neutral-950/95 backdrop-blur-md flex flex-col justify-between p-6 z-50 animate-fade-in">
          {/* Lightbox Header */}
          <div className="flex justify-between items-center text-white pb-3 border-b border-white/10">
            <div className="text-left">
              <h2 className="text-sm font-serif font-bold tracking-wider uppercase text-natural-cream">{tree.name}</h2>
              <p className="text-[11px] text-zinc-400 font-mono">Photo {carouselImageIndex + 1} of {photos.length}</p>
            </div>
            <button
              onClick={() => setIsViewerOpen(false)}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition cursor-pointer"
              title="Close Fullscreen Viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Lightbox Central Canvas */}
          <div className="relative flex-1 flex items-center justify-center select-none py-6">
            {activePhoto.base64 ? (
              <img
                src={activePhoto.base64 || undefined}
                alt={`${tree.name} portrait`}
                className="max-w-full max-h-[70vh] object-contain shadow-2xl rounded-lg"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-white/40 gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-natural-sage" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Loading Full Resolution Image...</span>
              </div>
            )}

            {/* Left Button */}
            {photos.length > 1 && (
              <button
                disabled={carouselImageIndex === 0}
                onClick={() => {
                  if (carouselImageIndex > 0) {
                    setCarouselImageIndex(carouselImageIndex - 1);
                  }
                }}
                className={`absolute left-2 sm:left-6 p-3 bg-white/10 hover:bg-white/20 hover:scale-105 hover:text-white rounded-full text-zinc-300 transition-all cursor-pointer border border-white/10 flex items-center justify-center ${
                  carouselImageIndex === 0 ? 'opacity-25 cursor-not-allowed' : ''
                }`}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Right Button */}
            {photos.length > 1 && (
              <button
                disabled={carouselImageIndex === photos.length - 1}
                onClick={() => {
                  if (carouselImageIndex < photos.length - 1) {
                    setCarouselImageIndex(carouselImageIndex + 1);
                  }
                }}
                className={`absolute right-2 sm:right-6 p-3 bg-white/10 hover:bg-white/20 hover:scale-105 hover:text-white rounded-full text-zinc-300 transition-all cursor-pointer border border-white/10 flex items-center justify-center ${
                  carouselImageIndex === photos.length - 1 ? 'opacity-25 cursor-not-allowed' : ''
                }`}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Lightbox controls block */}
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-2xl mx-auto w-full text-white">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Taken:</span>
              <input
                type="date"
                value={activePhoto.takenAt}
                onChange={async (e) => {
                  const nextPhotos = photos.map(p => p.id === activePhoto.id ? { ...p, takenAt: e.target.value } : p);
                  await handlePhotoUploadAndUpdate(nextPhotos);
                }}
                className="bg-neutral-800 border border-white/10 text-white rounded px-2 py-1 text-xs cursor-pointer font-mono"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={async () => {
                  const nextPhotos = photos.map(p => ({
                    ...p,
                    isStarred: p.id === activePhoto.id
                  }));
                  await handlePhotoUploadAndUpdate(nextPhotos);
                }}
                className={`p-2 rounded-xl border transition-all flex items-center justify-center cursor-pointer ${
                  activePhoto.isStarred 
                    ? 'bg-amber-500 text-neutral-950 border-amber-500 hover:bg-amber-400' 
                    : 'bg-transparent border-white/10 hover:bg-white/5 text-zinc-300'
                }`}
                title={activePhoto.isStarred ? 'Display Featured' : 'Star as Thumbnail'}
              >
                <Star className={`w-4 h-4 ${activePhoto.isStarred ? 'fill-current' : ''}`} />
              </button>

              <button
                onClick={() => {
                  setDeletingPhotoId(activePhoto.id);
                }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-serif font-bold rounded-xl flex items-center gap-1 cursor-pointer transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Graveyard Confirmation Modal */}
      {isConfirmingDeath && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-rose-200 rounded-[32px] max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-5 text-left transition-all">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-2 font-mono">
              <Skull className="w-4 h-4 text-rose-700" /> Move to Graveyard
            </span>
            <div className="space-y-2.5">
              <p className="text-sm text-natural-dark leading-relaxed">
                You are about to transfer <strong>{tree.name}</strong> to the memorial graveyard. 
              </p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Add any final notes or lessons learned below.
              </p>
            </div>
            
            <textarea
              value={lessonNote}
              onChange={(e) => setLessonNote(e.target.value)}
              placeholder="e.g. Stem cutting too early, or severe dry spell during summer. Next time, check soil moisture daily."
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs text-natural-dark focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white min-h-[120px] leading-relaxed transition-all"
              rows={4}
            />
            
            <div className="flex justify-end gap-2 pt-2 border-t border-rose-100/55">
              <button
                type="button"
                onClick={() => setIsConfirmingDeath(false)}
                className="px-3.5 py-2 text-zinc-500 hover:text-zinc-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await updateTree(tree.id, {
                    isDead: true,
                    lessonLearned: lessonNote || 'No specific lesson recorded.'
                  });
                  onBack();
                }}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Confirm Move 🪦
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Photo Confirmation Modal */}
      {deletingPhotoId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60] text-left">
          <div className="bg-white border border-rose-200 rounded-[32px] max-w-sm w-full p-6 shadow-2xl space-y-4 text-left transition-all">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-2 font-mono">
              <Trash2 className="w-4 h-4 text-rose-700" /> Delete Photo
            </span>
            <div className="space-y-1.5">
              <p className="text-sm text-natural-dark leading-relaxed">
                Are you sure you would like to delete this photo?
              </p>
            </div>
            
            <div className="flex justify-end gap-2 pt-2 border-t border-rose-100/55">
              <button
                type="button"
                onClick={() => setDeletingPhotoId(null)}
                className="px-3.5 py-1.5 text-zinc-500 hover:text-zinc-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetId = deletingPhotoId;
                  setDeletingPhotoId(null);
                  const nextPhotos = photos.filter(p => p.id !== targetId);
                  await handlePhotoUploadAndUpdate(nextPhotos);
                  
                  // Reset indices
                  setCarouselImageIndex(0);
                  setIsViewerOpen(false);
                }}
                className="px-4 py-1.5 bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs rounded-xl cursor-pointer"
              >
                Delete Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Specimen Erase Confirmation Modal */}
      {isConfirmingDelete && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 text-left">
          <div className="bg-white border border-rose-200 rounded-[32px] max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-5 text-left transition-all">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-2 font-mono">
              <Trash2 className="w-4 h-4 text-rose-700" /> Delete Tree
            </span>
            <div className="space-y-2.5">
              <p className="text-sm text-natural-dark leading-relaxed">
                Are you sure you want to permanently erase <strong>{tree.name}</strong> from your collection directory?
              </p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                This will delete all growth logs, history timelines, chronological photos, and pending chores. This action is irreversible and will synchronize across all backups.
              </p>
            </div>
            
            <div className="flex justify-end gap-2 pt-3 border-t border-rose-100/55">
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                className="px-3.5 py-2 text-zinc-500 hover:text-zinc-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsConfirmingDelete(false);
                  await deleteTree(tree.id);
                  onBack();
                }}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Erase Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tree Information Modal Dialogue */}
      {showEditForm && (
        <div className="fixed inset-0 bg-[#0F172A]/45 backdrop-blur-xs flex items-center justify-center p-4 z-40">
          <div className="bg-white border border-[#CBD5E1] rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[85vh] overflow-y-auto p-5 sm:p-6 shadow-xl space-y-4">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block font-mono">Update Tree Registration</span>
            <form onSubmit={handleUpdateTree} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#555] block">Tree Name / Nickname</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#555] block">Species</label>
                <select
                  value={editSpeciesSelectOption}
                  onChange={(e) => setEditSpeciesSelectOption(e.target.value)}
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

              {editSpeciesSelectOption === 'custom' && (
                <div className="space-y-1 animate-fade-in">
                  <label className="text-xs font-semibold text-[#555] block">Type Custom Species Name (Botanical or Common)</label>
                  <input
                    type="text"
                    value={editCustomSpecies}
                    onChange={(e) => setEditCustomSpecies(e.target.value)}
                    required
                    placeholder="e.g. Acer palmatum, Juniperus chinensis"
                    className="w-full bg-white border border-[#D9E4CE] bg-natural-bg/10 rounded-xl px-3 py-1.5 text-xs text-natural-dark focus:outline-none focus:ring-1 focus:ring-natural-sage"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#555] block">Style</label>
                <select
                  value={editStyle}
                  onChange={(e) => setEditStyle(e.target.value)}
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#555] block">Age (approx years)</label>
                  <input
                    type="number"
                    value={editAge}
                    onChange={(e) => setEditAge(e.target.value)}
                    className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#555] block">Date Acquired</label>
                  <input
                    type="date"
                    value={editAcquired}
                    onChange={(e) => setEditAcquired(e.target.value)}
                    className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#555] block">Care History / Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark leading-relaxed"
                />
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-[#F2EDE2]">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditForm(false);
                    setIsConfirmingDelete(true);
                  }}
                  className="px-3 py-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-xs font-bold font-mono rounded-xl flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Tree
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditForm(false)}
                    className="px-3 py-1.5 text-zinc-500 hover:text-zinc-700 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl cursor-pointer"
                  >
                    Save Updates
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tree specific Active Chores Checklist section */}
      <div className="p-5 bg-white border border-natural-cream rounded-[32px] space-y-4 shadow-xs">
        <div className="flex justify-between items-center pb-2 border-b border-natural-cream/40">
          <div>
            <h3 className="text-xs font-serif font-bold text-natural-forest uppercase tracking-wider flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-natural-sage" />
              Active Reminders & Tasks
            </h3>
          </div>
          <button
            onClick={() => setShowChoreForm(!showChoreForm)}
            className="text-[10px] font-serif font-bold text-natural-forest hover:text-natural-clay transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" /> Add Task
          </button>
        </div>

        {/* Add Chore Inline Form Slider */}
        <AnimatePresence>
          {showChoreForm && (
            <motion.form
              onSubmit={handleAddChore}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-4 bg-natural-bg/60 rounded-2xl border border-natural-cream/60 space-y-3 overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-natural-muted uppercase">Task Type</label>
                  <select
                    value={choreType}
                    onChange={(e) => setChoreType(e.target.value)}
                    className="w-full bg-white border border-natural-cream rounded-xl px-2 py-1.5 text-xs text-natural-dark"
                  >
                    <option value="Wire">Wire</option>
                    <option value="Check Wire">Check Wire</option>
                    <option value="Repot">Repot</option>
                    <option value="Fertilize">Fertilize</option>
                    <option value="Styling">Styling</option>
                    <option value="Pruning">Pruning</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-natural-muted uppercase">Duty Due Date</label>
                  <input
                    type="date"
                    value={choreDueDate}
                    onChange={(e) => setChoreDueDate(e.target.value)}
                    required
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs font-mono text-natural-dark"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-natural-muted uppercase">Task Notes / Description</label>
                <input
                  type="text"
                  value={choreTitle}
                  onChange={(e) => setChoreTitle(e.target.value)}
                  required
                  placeholder="e.g. prune upper branches, water with compost mist"
                  className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowChoreForm(false)}
                  className="px-3 py-1 text-natural-muted hover:text-natural-forest text-[11px] font-serif font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1 bg-natural-clay hover:bg-natural-clay/90 text-white rounded-xl text-[11px] font-serif font-bold cursor-pointer"
                >
                  Create Task
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Chores Listing */}
        {treeTasks.length === 0 ? (
          <div className="text-center py-4 border border-dashed border-natural-cream/60 rounded-2xl bg-[#FCFAF5]/50">
            <span className="text-[11px] text-natural-muted italic">No reminders scheduled for this tree</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {treeTasks.map((task) => {
              const isConfirming = confirmingTaskId === task.id;
              
              if (isConfirming && confirmingActionType) {
                return (
                  <div
                    key={task.id}
                    className="flex flex-col gap-1.5 p-2.5 bg-amber-50/20 border border-amber-200/60 rounded-xl animate-fade-in text-left font-mono"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-amber-900 flex items-center gap-1 leading-normal font-serif">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        {confirmingActionType === 'delete' ? 'Delete Task?' : 
                         confirmingActionType === 'complete' ? 'Complete Task?' : 'Re-open Task?'}
                      </span>
                      <span className="text-[9px] text-amber-750 truncate max-w-[50%] font-semibold">
                        "{task.title}"
                      </span>
                    </div>
                    <div className="flex justify-end gap-1.5 text-[9px]">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingTaskId(null);
                          setConfirmingActionType(null);
                        }}
                        className="px-2 py-0.5 bg-white border border-stone-250 text-stone-600 rounded-md cursor-pointer uppercase font-extrabold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmTaskAction(task.id, confirmingActionType === 'complete')}
                        className={`px-2 py-0.5 text-white rounded-md cursor-pointer uppercase font-extrabold ${
                          confirmingActionType === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-natural-forest hover:bg-natural-forest/90'
                        }`}
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-2.5 bg-natural-bg/20 hover:bg-natural-bg/40 border border-natural-cream/40 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-2 max-w-[70%]">
                    <button
                      onClick={() => handleToggleTaskDirect(task.id, !!task.completed)}
                      className="text-natural-muted hover:text-natural-sage transition-colors shrink-0 cursor-pointer"
                      title={task.completed ? "Re-open task" : "Complete task"}
                    >
                      {task.completed ? (
                        <CheckCircle className="w-4 h-4 text-natural-sage" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-natural-cream shrink-0 hover:border-natural-sage" />
                      )}
                    </button>
                    <span className={`text-xs leading-tight truncate ${task.completed ? 'line-through text-natural-muted' : 'text-natural-dark font-serif font-bold'}`}>
                      {task.title}
                    </span>
                    <span className="p-0.5 rounded bg-white shrink-0">
                      {getCareIcon(task.type as CareType)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right whitespace-nowrap">
                      <span className={`text-[9px] font-mono font-bold ${task.completed ? 'text-natural-muted line-through' : 'text-natural-forest'}`}>
                        {formatLocalDate(task.dueDate, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <button
                      onClick={() => triggerConfirmTaskAction(task.id, 'delete')}
                      className="text-natural-muted hover:text-rose-600 p-0.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Trunk thickness growth chart log & analysis */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-serif font-bold text-natural-dark flex items-center gap-2">
            <LineChart className="w-4 h-4 text-natural-sage" />
            Trunk Growth Log (Thickness)
          </h3>
          <button
            onClick={() => setShowMForm(!showMForm)}
            className="text-xs font-serif font-bold text-natural-forest border border-natural-cream hover:bg-natural-bg px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Log Measurement
          </button>
        </div>

        {/* Add Measurement Inline Slider */}
        <AnimatePresence>
          {showMForm && (
            <motion.form 
              onSubmit={handleAddMeasurement}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-5 bg-[#FDFBF7] rounded-[32px] border border-natural-cream space-y-3.5 overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-natural-muted uppercase">Trunk Width (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={logWidth}
                    onChange={(e) => setLogWidth(e.target.value)}
                    required
                    placeholder="e.g. 1.5"
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-natural-muted uppercase">Date</label>
                  <input
                    type="date"
                    value={logMDate}
                    onChange={(e) => setLogMDate(e.target.value)}
                    required
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs font-mono text-natural-dark"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1 border-t border-[#F2EDE2]/60">
                <button
                  type="button"
                  onClick={() => setShowMForm(false)}
                  className="px-3 py-1.5 text-natural-muted hover:text-natural-forest text-xs font-serif font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-natural-clay hover:bg-natural-clay/90 text-white rounded-xl text-xs font-serif font-bold cursor-pointer"
                >
                  Log Curve Point
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <MetricChart measurements={treeMeasurements} />

        {/* List & Edit existing Measurements */}
        {treeMeasurements.length > 0 && (
          <div className="mt-4 border border-natural-cream bg-white rounded-2xl overflow-hidden text-xs shadow-xs">
            <button
              type="button"
              onClick={() => setIsMLogExpanded(!isMLogExpanded)}
              className="w-full text-left bg-natural-bg/50 px-3.5 py-2.5 border-b border-natural-cream text-[10px] font-mono font-bold uppercase tracking-wider text-natural-muted flex justify-between items-center hover:bg-natural-bg transition-colors"
            >
              <span>Logged Measurement Points</span>
              <span className="text-xs transition-transform duration-200" style={{ transform: isMLogExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                {isMLogExpanded ? '▼' : '▶'}
              </span>
            </button>
            {isMLogExpanded && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-natural-bg/25 text-[9px] font-bold text-natural-muted uppercase border-b border-natural-cream">
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Thickness</th>
                      <th className="px-4 py-2.5 text-right w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-natural-cream text-natural-dark">
                    {[...treeMeasurements]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((m) => {
                        const isEditing = editingMeasurementId === m.id;
                        return (
                          <tr key={m.id} className="hover:bg-natural-bg/10 align-middle">
                            {isEditing ? (
                              <>
                                <td className="px-4 py-2 font-mono">
                                  <input
                                    type="date"
                                    value={editMDate}
                                    onChange={(e) => setEditMDate(e.target.value)}
                                    className="bg-white border border-natural-cream rounded px-2 py-1 text-xs w-28 text-natural-dark"
                                    required
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <span className="inline-flex items-center gap-1">
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={editMWidth}
                                      onChange={(e) => setEditMWidth(e.target.value)}
                                      className="bg-white border border-natural-cream rounded px-2 py-1 text-xs w-16 text-natural-dark"
                                      required
                                    />
                                    <span>cm</span>
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right space-x-1.5 whitespace-nowrap">
                                  <button
                                    onClick={(e) => handleSaveEditMeasurement(e, m.id)}
                                    className="text-emerald-700 hover:underline font-bold text-[9px] uppercase tracking-wider cursor-pointer bg-emerald-50 px-2 py-1 rounded border border-emerald-200"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingMeasurementId(null)}
                                    className="text-natural-muted hover:underline font-bold text-[9px] uppercase tracking-wider cursor-pointer bg-natural-bg px-2 py-1 rounded border border-natural-cream"
                                  >
                                    Cancel
                                  </button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-3.5 font-mono whitespace-nowrap">
                                  {formatLocalDate(m.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td className="px-4 py-3.5 font-bold text-natural-forest whitespace-nowrap">
                                  {(Math.round(m.width * 10) / 10).toFixed(1)} cm
                                </td>
                                <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-2 w-24">
                                  <button
                                    onClick={() => handleStartEditMeasurement(m)}
                                    className="text-natural-muted hover:text-natural-forest transition-colors cursor-pointer inline-flex items-center"
                                    title="Edit measurement"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteMeasurement(tree.id, m.id)}
                                    className="text-natural-muted hover:text-rose-650 transition-colors cursor-pointer inline-flex items-center"
                                    title="Delete measurement"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
          )}
          </div>
        )}
      </div>

       {/* Care Activities Logs */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-serif font-bold text-natural-dark flex items-center gap-2">
            <Activity className="w-4 h-4 text-natural-sage" />
            Work Performed
          </h3>
          <button
            onClick={() => setShowLogForm(!showLogForm)}
            className="text-xs font-serif font-bold text-natural-forest border border-natural-cream hover:bg-natural-bg px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Record Care
          </button>
        </div>

        {/* Record Care log form slider */}
        <AnimatePresence>
          {showLogForm && (
            <motion.form 
              onSubmit={handleAddCareLog}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-5 sm:p-6 bg-[#FDFBF7] rounded-[32px] border border-natural-cream space-y-4 overflow-hidden text-left"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-natural-muted uppercase">Date Performed</label>
                  <input
                    type="date"
                    value={careDate}
                    onChange={(e) => setCareDate(e.target.value)}
                    required
                    className="w-full bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs font-mono text-natural-dark"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-natural-muted uppercase">Work Done / Observations (Free Text)</label>
                <textarea
                  value={careNotes}
                  onChange={(e) => setCareNotes(e.target.value)}
                  rows={3}
                  required
                  placeholder="Describe your maintenance, wiring, or pruning work performed..."
                  className="w-full bg-white border border-natural-cream rounded-xl px-3 py-2 text-xs text-natural-dark focus:outline-none"
                />
              </div>

              {/* INTEGRATED ADDONS */}
              <div className="border-t border-[#F2EDE2]/80 pt-4 space-y-4">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#9F8C73] block">
                  Optional Actions Linkage
                </span>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Photo Addon Column */}
                  <div className="bg-white border border-[#F2EDE2] rounded-2xl p-4 space-y-2.5 flex flex-col justify-between">
                    <div>
                      <span className="text-[10.5px] font-bold font-serif text-natural-forest flex items-center gap-1">
                        <Camera className="w-3.5 h-3.5 text-natural-sage" /> Attach Photo
                      </span>
                      <p className="text-[9.5px] text-zinc-400 mt-0.5 leading-relaxed">Add a snapshot to this specimen's timeline.</p>
                    </div>

                    <div className="space-y-2">
                      {carePhotoBase64 ? (
                        <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-[#D9E4CE] bg-stone-100 group">
                          <img
                            src={carePhotoBase64 || undefined}
                            alt="Attached specimen snap"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setCarePhotoBase64('');
                              setCareFullPhotoBase64('');
                              setCareExtractedMeta(null);
                            }}
                            className="absolute top-1 right-1 p-1 bg-white/90 hover:bg-rose-600 hover:text-white text-rose-600 rounded-full border border-rose-100 transition shadow cursor-pointer text-[10px] flex items-center justify-center"
                            title="Remove Photo"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => fileInputRefRecordCare.current?.click()}
                            disabled={carePhotoLoading}
                            className="w-full py-1.5 bg-stone-50 hover:bg-natural-bg/40 border border-[#F2EDE2] text-[10px] font-bold text-natural-forest rounded-xl inline-flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-natural-sage" /> File Browse
                          </button>
                          <button
                            type="button"
                            onClick={() => cameraInputRefRecordCare.current?.click()}
                            disabled={carePhotoLoading}
                            className="w-full py-1.5 bg-stone-50 hover:bg-natural-bg/40 border border-[#F2EDE2] text-[10px] font-bold text-natural-forest rounded-xl inline-flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Camera className="w-3.5 h-3.5 text-natural-sage" /> Take Snapshot
                          </button>
                        </div>
                      )}
                      <input
                        ref={fileInputRefRecordCare}
                        type="file"
                        accept="image/*"
                        onChange={handleRecordCarePhotoSelect}
                        className="hidden"
                      />
                      <input
                        ref={cameraInputRefRecordCare}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleRecordCarePhotoSelect}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Trunk Measurement Column */}
                  <div className={`bg-white border rounded-2xl p-4 space-y-2.5 transition-colors ${careWidthEnabled ? 'border-natural-sage/55 bg-[#FAF9F5]' : 'border-[#F2EDE2]'}`}>
                    <label className="flex items-center justify-between cursor-pointer select-none">
                      <span className="text-[10.5px] font-bold font-serif text-natural-forest flex items-center gap-1">
                        <Scale className="w-3.5 h-3.5 text-natural-sage" /> Log Width
                      </span>
                      <input
                        type="checkbox"
                        checked={careWidthEnabled}
                        onChange={(e) => setCareWidthEnabled(e.target.checked)}
                        className="rounded text-natural-forest focus:ring-natural-forest cursor-pointer w-3.5 h-3.5"
                      />
                    </label>
                    <p className="text-[9.5px] text-zinc-400 leading-relaxed">Chronicle trunk diameter trends sequentially.</p>

                    {careWidthEnabled && (
                      <div className="space-y-2 pt-1.5 animate-fade-in text-[10px]">
                        <div className="space-y-1">
                          <label className="text-[8.5px] font-bold text-natural-muted uppercase">Width / Diameter (cm)</label>
                          <input
                            type="number"
                            step="0.1"
                            value={careWidth}
                            onChange={(e) => setCareWidth(e.target.value)}
                            required={careWidthEnabled}
                            placeholder="e.g. 3.2"
                            className="w-full bg-white border border-natural-cream rounded-lg px-2 py-1 font-mono text-xs text-natural-dark"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Scheduling / Reminder Column */}
                  <div className={`bg-white border rounded-2xl p-4 space-y-2.5 transition-colors ${careChoreEnabled ? 'border-natural-sage/55 bg-[#FAF9F5]' : 'border-[#F2EDE2]'}`}>
                    <label className="flex items-center justify-between cursor-pointer select-none">
                      <span className="text-[10.5px] font-bold font-serif text-natural-forest flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-natural-sage" /> Set Reminder
                      </span>
                      <input
                        type="checkbox"
                        checked={careChoreEnabled}
                        onChange={(e) => setCareChoreEnabled(e.target.checked)}
                        className="rounded text-natural-forest focus:ring-natural-forest cursor-pointer w-3.5 h-3.5"
                      />
                    </label>
                    <p className="text-[9.5px] text-zinc-400 leading-relaxed">Pin upcoming gardening chore due dates safely.</p>

                    {careChoreEnabled && (
                      <div className="space-y-2 pt-1.5 animate-fade-in text-[10px]">
                        <div className="space-y-1">
                          <label className="text-[8.5px] font-bold text-natural-muted uppercase">Reminder Title</label>
                          <input
                            type="text"
                            value={careChoreTitle}
                            onChange={(e) => setCareChoreTitle(e.target.value)}
                            required={careChoreEnabled}
                            placeholder="e.g. Water / Scheduled wire"
                            className="w-full bg-white border border-natural-cream rounded-lg px-2 py-1 text-natural-dark font-sans"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8.5px] font-bold text-natural-muted uppercase">Chore Type</label>
                          <select
                            value={careChoreType}
                            onChange={(e) => setCareChoreType(e.target.value)}
                            className="w-full bg-white border border-natural-cream rounded-lg px-2 py-1 text-natural-dark shadow-xs"
                          >
                            <option value="Water">Watering</option>
                            <option value="Wire">Wiring</option>
                            <option value="Prune">Pruning</option>
                            <option value="Repot">Repotting</option>
                            <option value="Fertilize">Fertilization</option>
                            <option value="Spray">Pesticide Spray</option>
                            <option value="Custom">Custom / General</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8.5px] font-bold text-natural-muted uppercase">Due Date</label>
                          <input
                            type="date"
                            value={careChoreDueDate}
                            onChange={(e) => setCareChoreDueDate(e.target.value)}
                            required={careChoreEnabled}
                            className="w-full bg-white border border-natural-cream rounded-lg px-2 py-1 text-natural-dark font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1.5 border-t border-[#F2EDE2]/60">
                <button
                  type="button"
                  onClick={() => setShowLogForm(false)}
                  className="px-3.5 py-1.5 text-natural-muted hover:text-natural-forest text-xs font-serif font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-natural-clay hover:bg-natural-clay/90 text-white rounded-xl text-xs font-serif font-bold cursor-pointer inline-flex items-center gap-1 shadow-xs"
                >
                  Save Care Record
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Actions Logs Timeline Table lists */}
        {treeLogs.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-natural-cream rounded-[32px] bg-white">
            <span className="text-xs text-natural-muted font-bold block">No historic actions logged yet</span>
            <span className="text-[11px] text-natural-muted leading-relaxed mt-1 block">Your custom free-text notes about tree work will appear here.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {(() => {
              const sorted = [...treeLogs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              const displayed = isWorkExpanded ? sorted : sorted.slice(0, 1);
              return (
                <>
                  {displayed.map((log) => {
                    const isEditing = editingLogId === log.id;
                    return (
                      <div key={log.id} className="p-4 bg-white border border-natural-cream rounded-2xl shadow-xs transition-colors hover:border-natural-sage/50 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-left animate-fade-in">
                        {isEditing ? (
                          <div className="w-full space-y-3">
                            <div className="flex flex-col sm:flex-row gap-3">
                              <input
                                type="date"
                                value={editLogDate}
                                onChange={(e) => setEditLogDate(e.target.value)}
                                className="bg-white border border-natural-cream rounded-xl px-2.5 py-1.5 text-xs text-natural-dark font-mono max-w-xs focus:outline-none focus:border-natural-sage"
                                required
                              />
                            </div>
                            <textarea
                              value={editLogNotes}
                              onChange={(e) => setEditLogNotes(e.target.value)}
                              className="bg-white border border-natural-cream rounded-xl px-3 py-2 text-xs w-full text-natural-dark h-24 resize-y leading-normal focus:outline-none focus:border-natural-sage"
                              placeholder="Describe work done..."
                              required
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingLogId(null)}
                                className="px-3 py-1.5 border border-natural-cream text-natural-muted hover:text-natural-forest rounded-xl text-[10px] font-mono font-bold uppercase transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleSaveEditCareLog(e, log.id)}
                                className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[10px] font-mono font-bold uppercase transition-all"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-1.5 text-left flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="inline-block px-2 py-0.5 bg-natural-bg border border-natural-cream/60 rounded-md text-[10px] font-mono font-bold text-natural-forest">
                                  {formatLocalDate(log.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                              </div>
                              <p className="text-xs text-natural-dark whitespace-pre-wrap leading-relaxed break-words">
                                {log.notes || 'Care event recorded'}
                              </p>
                            </div>
                            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-natural-cream/50">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditCareLog(log)}
                                  className="p-1 px-1.5 hover:bg-natural-bg rounded-lg text-natural-muted hover:text-natural-forest transition-colors cursor-pointer"
                                  title="Edit log"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteCareLog(tree.id, log.id)}
                                  className="p-1 px-1.5 hover:bg-rose-50 rounded-lg text-natural-muted hover:text-rose-700 transition-colors cursor-pointer"
                                  title="Delete log"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {sorted.length > 1 && (
                    <div className="flex justify-center pt-1">
                      <button
                        type="button"
                        onClick={() => setIsWorkExpanded(!isWorkExpanded)}
                        className="px-4 py-2 border border-natural-cream text-natural-forest hover:bg-natural-bg/50 rounded-xl text-[10px] font-mono font-bold tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-0 active:scale-95 shadow-xs"
                      >
                        {isWorkExpanded ? 'Collapse All Entries' : `Show All Entries (${sorted.length})`}
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Recognition Accolades section */}
      <div className="p-5 bg-white border border-natural-cream rounded-[24px] shadow-xs space-y-3 text-left">
        <div className="flex justify-between items-center text-left">
          <h3 className="text-sm font-serif font-bold text-natural-forest uppercase tracking-wider flex items-center gap-1.5">
            <Award className="w-4 h-4 text-natural-clay" />
            Accolades
          </h3>
          {!showAddAccoladeForm && (
            <button
              type="button"
              onClick={() => setShowAddAccoladeForm(true)}
              className="text-[10px] sm:text-xs font-mono font-bold bg-natural-sage/10 hover:bg-natural-sage/20 border border-natural-sage/20 text-natural-forest px-3.5 py-1.5 rounded-xl cursor-pointer hover:shadow-xs transition-all flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Accolade
            </button>
          )}
        </div>

        {showAddAccoladeForm && (
          <form onSubmit={handleAddAccoladeSubmit} className="space-y-4 p-4 border border-natural-cream bg-stone-50 rounded-2xl animate-fade-in text-left">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-natural-forest">Record New Accolade</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">Accolade *</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g., Best in Show - TBS Expo 2026"
                  value={accoladeTitle}
                  onChange={(e) => setAccoladeTitle(e.target.value)}
                  className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark focus:outline-none focus:border-natural-sage"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">Date</label>
                <input 
                  type="date"
                  value={accoladeDate}
                  onChange={(e) => setAccoladeDate(e.target.value)}
                  className="w-full bg-white border border-natural-cream rounded-xl px-3 py-1.5 text-xs text-natural-dark focus:outline-none focus:border-natural-sage font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 block">Photo (optional)</label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer border border-dashed border-stone-300 hover:border-natural-sage bg-white hover:bg-stone-50 transition p-2 px-3 rounded-xl flex items-center gap-1.5 text-xs text-stone-600 font-mono">
                  <ImageIcon className="w-3.5 h-3.5 text-stone-400" />
                  {accoladePhotoLoading ? 'Processing...' : accoladePhoto ? 'Change Photo' : 'Upload Picture'}
                  <input 
                    type="file"
                    accept="image/*"
                    onChange={handleAccoladePhotoSelect}
                    disabled={accoladePhotoLoading}
                    className="hidden"
                  />
                </label>
                {accoladePhoto && (
                  <div className="relative w-12 h-12 border border-natural-cream rounded-lg overflow-hidden group shrink-0 shadow-xs bg-stone-100">
                    <img 
                      src={accoladePhoto || undefined} 
                      alt="Accolade preview" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <button
                      type="button"
                      onClick={() => setAccoladePhoto('')}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-natural-cream">
              <button
                type="button"
                onClick={() => {
                  setAccoladeTitle('');
                  setAccoladeDate(new Date().toISOString().split('T')[0]);
                  setAccoladePhoto('');
                  setShowAddAccoladeForm(false);
                }}
                className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider border border-natural-cream text-stone-500 hover:bg-white rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={accoladePhotoLoading}
                className="px-4 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-natural-sage disabled:bg-neutral-300 text-white rounded-xl transition-all cursor-pointer hover:shadow-xs"
              >
                Save Award
              </button>
            </div>
          </form>
        )}

        {/* Accolades List */}
        {normalizedAccolades.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 pt-1">
            {normalizedAccolades.map((accolade) => (
              <div 
                key={accolade.id}
                className="p-3 bg-stone-50 border border-natural-cream rounded-[20px] flex items-center justify-between gap-3 text-left animate-fade-in group hover:bg-stone-50/75 hover:border-natural-sage/35 transition-all"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {accolade.photoBase64 ? (
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-natural-cream/80 shadow-xs shrink-0 bg-stone-100">
                      <img 
                        src={accolade.photoBase64 || undefined} 
                        alt={accolade.title} 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-xl border border-dashed border-stone-200 bg-white text-stone-300 flex items-center justify-center shrink-0">
                      <Award className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-serif font-bold text-natural-dark leading-snug truncate sm:whitespace-normal">
                      {accolade.title}
                    </p>
                    <span className="text-[10px] font-mono text-natural-muted font-bold block mt-1">
                      {formatLocalDate(accolade.date, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteAccolade(accolade.id)}
                  className="p-1.5 hover:bg-rose-50 text-stone-400 hover:text-rose-600 rounded-xl transition shrink-0 cursor-pointer"
                  title="Remove recognition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          !showAddAccoladeForm && (
            <div className="p-5 bg-stone-50 border border-dashed border-stone-200 rounded-[20px] text-center animate-fade-in">
              <p className="text-xs text-natural-muted italic">No accolades or general award achievements are documented for this tree.</p>
              <button
                type="button"
                onClick={() => setShowAddAccoladeForm(true)}
                className="mt-2 text-[10px] font-mono font-bold uppercase tracking-wider text-natural-forest hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                Create Accolade Entry &rarr;
              </button>
            </div>
          )
        )}
      </div>

      {/* PREMIUM GEMINI BONSAI AI DOCTOR OR STYLING ADVICE CONSULT */}
      <div className="flex flex-col items-center justify-center pt-5 border-t border-natural-cream/60 mt-8 space-y-4">
        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          <button
            onClick={consultBonsaiMaster}
            disabled={aiLoading}
            className="px-5 py-2.5 bg-natural-clay hover:bg-natural-clay/95 disabled:bg-natural-clay/50 text-white font-serif font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs whitespace-nowrap"
          >
            {aiLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Consulting...
              </>
            ) : (
              <>
                <Bot className="w-4 h-4" /> Consult AI
              </>
            )}
          </button>

          <button
            onClick={() => setShowEditForm(true)}
            className="px-4 py-2.5 bg-white hover:bg-stone-50 text-natural-forest border border-natural-cream font-serif font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs whitespace-nowrap"
            title="Edit Tree Info"
          >
            <Edit className="w-4 h-4 text-natural-sage" /> Edit Tree
          </button>

          <button
            onClick={() => setIsConfirmingDeath(true)}
            className="px-4 py-2.5 bg-white hover:bg-rose-50 text-stone-600 hover:text-rose-700 border border-natural-cream hover:border-rose-200 font-serif font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs whitespace-nowrap"
            title="Move Specimen to Graveyard"
          >
            <Skull className="w-4 h-4 text-stone-400" /> Move to Graveyard
          </button>
        </div>

        {/* Master AI Advice Section Display */}
        <div className="w-full mt-4">
          <AnimatePresence>
          {aiLoading && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-5 bg-white rounded-2xl border border-dashed border-natural-sage/30 flex flex-col items-center justify-center text-center space-y-2"
            >
              <Loader2 className="w-6 h-6 animate-spin text-natural-forest" />
              <p className="text-xs font-bold text-natural-dark">The AI Consultant is reviewing your photos, logs & growth measurements...</p>
              <p className="text-[10px] text-natural-muted leading-relaxed">Fusing chronological data to formulate a tailored species care roadmap for the upcoming year.</p>
            </motion.div>
          )}

          {aiError && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 border border-rose-250 bg-rose-50/10 rounded-2xl flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="text-xs font-serif font-bold text-rose-800 block">Consultation Halted</span>
                <p className="text-[11px] text-rose-700 leading-relaxed">{aiError}</p>
              </div>
            </motion.div>
          )}

          {aiDiagnosis && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-white border border-natural-cream rounded-[24px] shadow-inner space-y-2 leading-relaxed"
            >
              <span className="text-[10px] uppercase font-mono bg-natural-bg text-natural-forest px-2.5 py-1 rounded font-bold">
                AI Consultant Roadmap
              </span>
              
              <div className="prose prose-sm max-w-none text-xs text-natural-dark pt-2 font-serif leading-relaxed">
                <Markdown>{aiDiagnosis}</Markdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {showCarouselWebcam && (
          <WebcamCapture
            onCapture={handleCarouselWebcamCapture}
            onClose={() => setShowCarouselWebcam(false)}
          />
        )}
        {showRecordCareWebcam && (
          <WebcamCapture
            onCapture={handleRecordCareWebcamCapture}
            onClose={() => setShowRecordCareWebcam(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
