import { DecodedIdToken } from 'firebase-admin/auth';
import { DatabaseReference } from 'firebase-admin/database';

export interface ServerContext {
  user: DecodedIdToken;
  dbRef: DatabaseReference;
}

export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface DatabaseTransaction {
  ref: DatabaseReference;
  value: any;
} 