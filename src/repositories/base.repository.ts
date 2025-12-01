/**
 * Base Repository
 * Abstract database operations for consistent data access patterns
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export abstract class BaseRepository<T> {
  protected tableName: string;
  protected supabase: SupabaseClient;

  constructor(tableName: string, supabase?: SupabaseClient) {
    this.tableName = tableName;
    this.supabase = supabase || createServerClient();
  }

  async findById(id: string): Promise<T | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      logger.error({ error, table: this.tableName, id }, 'findById failed');
      throw error;
    }

    return data as T;
  }

  async findAll(options: PaginationOptions = {}): Promise<PaginatedResult<T>> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const { data, error, count } = await this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error({ error, table: this.tableName }, 'findAll failed');
      throw error;
    }

    return {
      data: (data || []) as T[],
      total: count || 0,
      limit,
      offset,
    };
  }

  async create(entity: Partial<T>): Promise<T> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(entity)
      .select()
      .single();

    if (error) {
      logger.error({ error, table: this.tableName }, 'create failed');
      throw error;
    }

    return data as T;
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error({ error, table: this.tableName, id }, 'update failed');
      throw error;
    }

    return data as T;
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) {
      logger.error({ error, table: this.tableName, id }, 'delete failed');
      throw error;
    }

    return true;
  }

  async count(filters?: Record<string, unknown>): Promise<number> {
    let query = this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true });

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
    }

    const { count, error } = await query;

    if (error) {
      logger.error({ error, table: this.tableName }, 'count failed');
      throw error;
    }

    return count || 0;
  }
}
