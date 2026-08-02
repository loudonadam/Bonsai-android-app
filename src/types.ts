export type BonsaiStatus = 'Pre-Bonsai' | 'Early Development' | 'Refinement' | 'Mature';

export type CareType = string;

export interface TreePhoto {
  id: string;
  base64: string;
  takenAt: string; // Date string: YYYY-MM-DD
  isStarred?: boolean;
  cameraModel?: string;
  location?: string;
}

export interface TreeAccolade {
  id: string;
  title: string;
  date: string;
  photoBase64?: string;
}

export interface Tree {
  id: string;
  userId: string;
  name: string;
  species: string;
  dateAcquired?: string;
  approximateAge?: number;
  originDate?: string; // Calculated date corresponding to age = 0, e.g. acquired 2 years ago has originDate 2 years before creation date
  style?: string;
  status: BonsaiStatus;
  notes?: string;
  photoBase64?: string;
  images?: (string | TreePhoto)[];
  photoPath?: string; // Standard relative file reference for backup/archive ZIPs
  accolades?: string; // Entries, Recognitions & Awards
  accoladesList?: TreeAccolade[]; // Structured list of awards, recognitions & achievements
  createdAt: any; // Firestore Timestamp or ISO string
  updatedAt: any;
  isDead?: boolean;
  lessonLearned?: string;
}

export interface Measurement {
  id: string;
  userId: string;
  treeId: string;
  date: string;
  width: number;
  notes?: string;
  createdAt: any;
}

export interface CareLog {
  id: string;
  userId: string;
  treeId: string;
  type: CareType;
  date: string;
  notes?: string;
  createdAt: any;
}

export interface Task {
  id: string;
  userId: string;
  treeId: string;
  title: string;
  type: string;
  dueDate: string;
  completed: boolean;
  completedAt?: any;
  createdAt: any;
}

export interface CareGuide {
  id: string;
  species: string;
  scientificName: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  placement: string;
  watering: string;
  fertilizing?: string;
  pruning: string;
  repotting: string;
  summary: string;
  seasonCare: {
    spring: string;
    summer: string;
    autumn: string;
    winter: string;
  };
}
