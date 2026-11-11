import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@get-bb/plugin-sdk/app";

import { JOB_CHANNEL, jobSchema, type Job } from "../contract";
import { useFmRpc } from "../lib/fm-rpc";

export interface UseJobsOptions {
  onFinished?: (job: Job) => void;
  onVanished?: (jobId: string) => void;
  pollIntervalMs?: number;
}

export interface UseJobsResult {
  jobs: Job[];
  activeJobs: Job[];
  track: (job: Job) => void;
  cancel: (jobId: string) => Promise<void>;
  dismiss: (jobId: string) => void;
  clearFinished: () => void;
}

function isRunning(job: Job): boolean {
  return job.state === "running";
}

export function useJobs(options: UseJobsOptions = {}): UseJobsResult {
  const { onFinished, onVanished, pollIntervalMs = 3000 } = options;
  const rpc = useFmRpc();
  const [jobs, setJobs] = useState<Job[]>([]);

  const callbacksRef = useRef({ onFinished, onVanished });
  callbacksRef.current = { onFinished, onVanished };

  const upsert = useCallback((job: Job) => {
    setJobs((previous) => {
      const index = previous.findIndex(
        (candidate) => candidate.jobId === job.jobId,
      );
      if (index === -1) return [...previous, job];
      const next = [...previous];
      next[index] = job;
      return next;
    });
  }, []);

  const seenStates = useRef(new Map<string, Job["state"]>());
  useEffect(() => {
    const seen = seenStates.current;
    for (const job of jobs) {
      const previous = seen.get(job.jobId);
      seen.set(job.jobId, job.state);
      if (previous !== job.state && !isRunning(job))
        callbacksRef.current.onFinished?.(job);
    }
    for (const jobId of [...seen.keys()]) {
      if (!jobs.some((job) => job.jobId === jobId)) seen.delete(jobId);
    }
  }, [jobs]);

  const track = useCallback(
    (job: Job) => {
      upsert(job);
    },
    [upsert],
  );

  const dismiss = useCallback((jobId: string) => {
    setJobs((previous) => previous.filter((job) => job.jobId !== jobId));
  }, []);

  const clearFinished = useCallback(() => {
    setJobs((previous) => previous.filter(isRunning));
  }, []);

  const cancel = useCallback(
    async (jobId: string) => {
      const result = await rpc.call("jobCancel", { jobId });
      if (result.job !== null) upsert(result.job);
      else dismiss(jobId);
    },
    [dismiss, rpc, upsert],
  );

  useRealtime(
    JOB_CHANNEL,
    useCallback(
      (payload: unknown) => {
        const parsed = jobSchema.safeParse(payload);
        if (parsed.success) upsert(parsed.data);
      },
      [upsert],
    ),
  );

  const runningKey = useMemo(
    () =>
      jobs
        .filter(isRunning)
        .map((job) => job.jobId)
        .join(","),
    [jobs],
  );

  useEffect(() => {
    if (pollIntervalMs <= 0 || runningKey === "") return;
    let disposed = false;
    const timer = setInterval(() => {
      for (const jobId of runningKey.split(",")) {
        void (async () => {
          try {
            const result = await rpc.call("jobStatus", { jobId });
            if (disposed) return;
            if (result.job !== null) upsert(result.job);
            else {
              dismiss(jobId);
              callbacksRef.current.onVanished?.(jobId);
            }
          } catch {}
        })();
      }
    }, pollIntervalMs);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [dismiss, pollIntervalMs, rpc, runningKey, upsert]);

  const activeJobs = useMemo(() => jobs.filter(isRunning), [jobs]);

  return { jobs, activeJobs, track, cancel, dismiss, clearFinished };
}
