import { ITableService } from '../interfaces/ITableService';
import { TableServiceClient } from '../tableService.client';
import { FirebaseTableService } from '../tableService.firebase';

export class TableServiceFactory {
  static create(tableId: string, useFirebase: boolean = true): ITableService {
    if (useFirebase) {
      return new FirebaseTableService(tableId);
    }
    return new TableServiceClient(tableId);
  }
} 