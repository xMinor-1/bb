import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { JOB_CHANNEL, type FileManagerErrorCode, type Job } from "../contract";

function isTerminal(job: Job): boolean {
  return job.state !== "running";
}

export interface CreateJobInput {
  kind?: Job["kind"];
  label: string;
  subject?: string;
  totalBytes?: number;
}

export interface JobsModule {
  jobStatus(input: { jobId: string }): { job: Job | null };
  jobCancel(input: { jobId: string }): { job: Job | null };

  create(input: CreateJobInput): Job;
  get(jobId: string): Job | null;
  progress(jobId: string, processedBytes: number): Job | null;
  succeed(jobId: string, resultPath: string | null): Job | null;
  fail(jobId: string, code: FileManagerErrorCode, message: string): Job | null;
  onCancel(jobId: string, canceller: () => void | Promise<void>): void;
  isCanceled(jobId: string): boolean;
  list(): Job[];
}

export interface JobsOptions {
  now?: () => number;
  maxJobs?: number;
}

const DEFAULT_MAX_JOBS = 200;

export function createJobs(
  bb: BbPluginApi,
  options: JobsOptions = {},
): JobsModule {
  const now = options.now ?? Date.now;
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_JOBS;
  const jobs = new Map<string, Job>();
  const cancellers = new Map<string, () => void | Promise<void>>();

  function publish(job: Job): void {
    try {
      bb.realtime.publish(JOB_CHANNEL, job);
    } catch (error) {
      bb.log.warn(
        `job signal for ${job.jobId} not published: ${String(error)}`,
      );
    }
  }

  function prune(): void {
    if (jobs.size <= maxJobs) return;
    for (const [jobId, job] of jobs) {
      if (jobs.size <= maxJobs) break;
      if (!isTerminal(job)) continue;
      jobs.delete(jobId);
      cancellers.delete(jobId);
    }
  }

  function settle(jobId: string, patch: Partial<Job>): Job | null {
    const job = jobs.get(jobId);
    if (!job || isTerminal(job)) return job ?? null;
    const next: Job = { ...job, ...patch };
    jobs.set(jobId, next);
    if (isTerminal(next)) cancellers.delete(jobId);
    publish(next);
    return next;
  }

  return {
    create(input) {
      const job: Job = {
        jobId: randomUUID(),
        kind: input.kind ?? "extract",
        state: "running",
        label: input.label,
        subject: input.subject ?? "",
        startedAtMs: now(),
        finishedAtMs: null,
        processedBytes: 0,
        totalBytes: input.totalBytes ?? 0,
        resultPath: null,
        errorCode: null,
        errorMessage: null,
      };
      jobs.set(job.jobId, job);
      prune();
      publish(job);
      return job;
    },

    get: (jobId) => jobs.get(jobId) ?? null,

    jobStatus: (input) => ({ job: jobs.get(input.jobId) ?? null }),

    jobCancel(input) {
      const job = jobs.get(input.jobId);
      if (!job) return { job: null };
      if (isTerminal(job)) return { job };

      const canceller = cancellers.get(job.jobId);
      const canceled = settle(job.jobId, {
        state: "canceled",
        finishedAtMs: now(),
      });
      if (canceller) {
        void (async () => {
          try {
            await canceller();
          } catch (error) {
            bb.log.warn(`job ${job.jobId} canceller failed: ${String(error)}`);
          }
        })();
      }
      return { job: canceled };
    },

    progress(jobId, processedBytes) {
      return settle(jobId, {
        processedBytes: Math.max(0, Math.floor(processedBytes)),
      });
    },

    succeed(jobId, resultPath) {
      const job = jobs.get(jobId);
      if (!job || isTerminal(job)) return job ?? null;
      return settle(jobId, {
        state: "done",
        finishedAtMs: now(),
        resultPath,
        processedBytes:
          job.totalBytes > 0 ? job.totalBytes : job.processedBytes,
      });
    },

    fail(jobId, code, message) {
      return settle(jobId, {
        state: "failed",
        finishedAtMs: now(),
        errorCode: code,
        errorMessage: message,
      });
    },

    onCancel(jobId, canceller) {
      const job = jobs.get(jobId);
      if (!job || isTerminal(job)) {
        void (async () => {
          try {
            await canceller();
          } catch (error) {
            bb.log.warn(`job ${jobId} canceller failed: ${String(error)}`);
          }
        })();
        return;
      }
      cancellers.set(jobId, canceller);
    },

    isCanceled(jobId) {
      return jobs.get(jobId)?.state === "canceled";
    },

    list: () => [...jobs.values()].reverse(),
  };
}
