import { NextResponse } from 'next/server'
import { getBlobAccess } from '@/lib/blob'

export const runtime = 'nodejs'

/** Runtime blob store access for browser uploads (avoids build-time env bake-in). */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ access: getBlobAccess() })
}