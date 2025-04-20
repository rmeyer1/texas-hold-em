import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { authMiddleware } from '@/app/api/middleware';
import { TableService } from '@/server/services/TableService';

const TableCreateSchema = z.object({
  name: z.string().min(3).max(50),
  smallBlind: z.number().min(1),
  bigBlind: z.number(),
  maxPlayers: z.number().min(2).max(10),
  isPrivate: z.boolean(),
  password: z.string()
    .regex(/^[a-zA-Z0-9]{6,}$/)
    .optional()
}).refine(
  (data) => {
    if (data.isPrivate && !data.password) {
      return false;
    }
    return true;
  },
  {
    message: "Password is required for private tables and must be at least 6 alphanumeric characters",
    path: ["password"]
  }
).refine(
  (data) => data.bigBlind === data.smallBlind * 2,
  {
    message: "Big blind must be exactly double the small blind",
    path: ["bigBlind"]
  }
);

export async function POST(req: NextRequest) {
  const authError = await authMiddleware(req);
  if (authError) return authError;

  // Get user from token
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  const decodedToken = await getAuth().verifyIdToken(token!);
  const userId = decodedToken.uid;

  // Check user's existing table count
  const db = getDatabase();
  const tablesRef = db.ref('tables');
  const userTablesSnapshot = await tablesRef
    .orderByChild('creatorId')
    .equalTo(userId)
    .get();

  if (userTablesSnapshot.exists() && Object.keys(userTablesSnapshot.val()).length >= 10) {
    return NextResponse.json(
      { error: 'User has reached maximum limit of 10 active tables' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const validatedData = TableCreateSchema.parse(body);

    // Generate unique table ID with timestamp and random string
    const tableId = `table-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const tableService = new TableService(tableId);
    const result = await tableService.createTable(tableId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message || 'Failed to create table' },
        { status: 500 }
      );
    }

    // Update table with additional data
    const updateResult = await tableService.updateTable({
      ...validatedData,
      createdAt: Date.now(),
      creatorId: userId,
      phase: 'waiting'
    });

    if (!updateResult.success) {
      return NextResponse.json(
        { error: updateResult.error?.message || 'Failed to update table data' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      tableId,
      message: 'Table created successfully'
    }, { status: 201 });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Table creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create table' },
      { status: 500 }
    );
  }
} 