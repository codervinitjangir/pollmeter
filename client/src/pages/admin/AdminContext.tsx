import React, { createContext, useContext } from 'react';
import {
  AuthUser,
  FacultyMember,
  UniversityOverview,
  StudentAuditItem,
  AuditLogItem,
  BatchObject,
} from '../../auth';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

export interface AdminDataContextType {
  authUser: AuthUser;
  overview: UniversityOverview | null;
  facultyList: FacultyMember[];
  studentAudit: StudentAuditItem[];
  auditLogs: AuditLogItem[];
  standardBatches: string[];
  allBatchObjects: BatchObject[];
  activeSubjects: string[];
  loading: boolean;
  loadingAudit: boolean;
  pendingCount: number;
  showToast: (message: string, type?: 'success' | 'error') => void;
  showConfirmDialog: (options: ConfirmDialogOptions) => void;
  loadAllData: () => Promise<void>;
  refreshBatches: () => Promise<void>;
  refreshAuditLogs: () => Promise<void>;
  setStudentAudit: React.Dispatch<React.SetStateAction<StudentAuditItem[]>>;
  setAllBatchObjects: React.Dispatch<React.SetStateAction<BatchObject[]>>;
  setStandardBatches: React.Dispatch<React.SetStateAction<string[]>>;
}

export const AdminDataContext = createContext<AdminDataContextType | null>(null);

export function useAdminData(): AdminDataContextType {
  const ctx = useContext(AdminDataContext);
  if (!ctx) {
    throw new Error('useAdminData must be used within an AdminDataContext.Provider');
  }
  return ctx;
}
