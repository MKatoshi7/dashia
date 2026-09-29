import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Áreas (workspaces). O painel inteiro filtra pela área ativa, que fica num
 * cookie e é propagada ao servidor. Leitura via cliente autenticado (RLS).
 */
export type Area = {
  id: string;
  nome: string;
  revenue_goal: number;
  created_at: string;
};

export const AREA_COOKIE = "area_id";

/** Lista as áreas da instância (ordenadas por criação). */
export const getAreas = cache(async (): Promise<Area[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("areas")
      .select("id, nome, revenue_goal, created_at")
      .order("created_at", { ascending: true });

    if (error || !data) return [];
    return data as Area[];
  } catch {
    return [];
  }
});

/** Área ativa: cookie válido, senão a primeira área existente. */
export const getActiveArea = cache(async (): Promise<Area | null> => {
  const areas = await getAreas();
  if (areas.length === 0) return null;

  const store = await cookies();
  const id = store.get(AREA_COOKIE)?.value;
  return areas.find((a) => a.id === id) ?? areas[0];
});
