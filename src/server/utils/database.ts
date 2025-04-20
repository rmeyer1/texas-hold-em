import { getDatabase, Reference, DataSnapshot } from 'firebase-admin/database';
import { adminDb } from '../config/firebase-admin';
import { ServerError } from './error-handler';
import { DatabaseTransaction } from '../types';

export async function atomicUpdate(transactions: DatabaseTransaction[]): Promise<void> {
  try {
    const updates: Record<string, any> = {};
    
    transactions.forEach(({ ref, value }) => {
      updates[ref.toString()] = value;
    });

    await adminDb.ref().update(updates);
  } catch (error) {
    throw new ServerError(
      'Failed to perform atomic update',
      'database/atomic-update-failed'
    );
  }
}

export async function getSnapshot(ref: Reference): Promise<DataSnapshot> {
  try {
    return await ref.once('value');
  } catch (error) {
    throw new ServerError(
      'Failed to fetch data',
      'database/fetch-failed'
    );
  }
}

export async function setData(ref: Reference, data: any): Promise<void> {
  try {
    await ref.set(data);
  } catch (error) {
    throw new ServerError(
      'Failed to set data',
      'database/set-failed'
    );
  }
}

export async function updateData(ref: Reference, data: any): Promise<void> {
  try {
    await ref.update(data);
  } catch (error) {
    throw new ServerError(
      'Failed to update data',
      'database/update-failed'
    );
  }
} 