import { neon } from '@neondatabase/serverless';

let neonClient: any = null;

export function getNeonClient() {
  if (!neonClient) {
    const databaseUrl = process.env.NEON_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('NEON_DATABASE_URL environment variable is not set');
    }
    neonClient = neon(databaseUrl);
  }
  return neonClient;
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const sql = getNeonClient();
  
  let result;
  if (params && params.length > 0) {
    // Use the new .query() method for parameterized queries with placeholders
    result = await sql.query(text, params);
  } else {
    // For queries without parameters, use tagged template literal approach
    // Create a template string array
    const templateArray = Object.assign([text], { raw: [text] });
    result = await sql(templateArray);
  }
  
  return {
    rows: Array.isArray(result) ? result as T[] : [result as T],
    rowCount: Array.isArray(result) ? result.length : 1
  };
}

export async function queryOne<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] || null;
}

export async function execute(
  text: string,
  params?: any[]
): Promise<{ rowCount: number }> {
  const sql = getNeonClient();
  
  let result;
  if (params && params.length > 0) {
    // Use the new .query() method for parameterized queries with placeholders
    result = await sql.query(text, params);
  } else {
    // For queries without parameters, use tagged template literal approach
    // Create a template string array
    const templateArray = Object.assign([text], { raw: [text] });
    result = await sql(templateArray);
  }
    
  return { rowCount: Array.isArray(result) ? result.length : 1 };
}