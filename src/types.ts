export type BonsaiStatus = 'Healthy' | 'Stressed' | 'Dormant' | 'In Training' | 'Diseased' | 'Recovering';

export type CareType = 'Watering' | 'Pruning' | 'Fertilizing' | 'Repotting' | 'Wiring' | 'Pest Control' | 'Styling';

export interface Tree {
  id: string;
  userId: string;
  name: string;
  species: string;
  dateAcquired?: string;
  approximateAge?: number;
  style?: string;
  status: BonsaiStatus;
  notes?: string;
  photoBase64?: string;
  createdAt: any; // Firestore Timestamp or ISO string
  updatedAt: any;
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
  fertilizing: string;
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
