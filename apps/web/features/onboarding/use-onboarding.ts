"use client";

// Онбординг (§6 раунд 2): створення компанії + AI-bootstrap брифу.
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { bootstrapStatusResponse } from "@forteq/shared";

import { http } from "@/lib/http";
import { endpoints } from "@/lib/endpoints";

const createResponse = z.object({ companyId: z.string() });

export function useCreateCompany() {
  return useMutation({
    mutationFn: (input: { name: string; websiteUrl?: string; description?: string }) =>
      http.post(endpoints.onboarding(), input, createResponse),
  });
}

export function useStartBootstrap() {
  return useMutation({
    mutationFn: (companyId: string) => http.post(endpoints.bootstrap(companyId)),
  });
}

const POLL_MS = 2500;
const MAX_POLLS = 40; // ~100с: довше за це bootstrap уже не «в роботі», а завис

export function useBootstrapStatus(companyId: string | null) {
  // useRef, а не локальна змінна: інакше лічильник скидався б на кожному рендері й межа
  // ніколи б не спрацювала — поллінг став би вічним.
  const polls = React.useRef(0);
  return useQuery({
    queryKey: ["bootstrap", companyId],
    queryFn: () => http.get(endpoints.bootstrap(companyId!), bootstrapStatusResponse),
    enabled: Boolean(companyId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      // Поллимо ЛИШЕ поки задача справді в роботі. idle означає «не запускали» — чекати нічого.
      if (s !== "pending" && s !== "running") {
        polls.current = 0;
        return false;
      }
      if (polls.current >= MAX_POLLS) return false;
      polls.current += 1;
      return POLL_MS;
    },
    refetchIntervalInBackground: false,
  });
}
