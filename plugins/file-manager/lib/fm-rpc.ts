import { useMemo, useRef } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type {
  PluginRpcCallArgs,
  PluginRpcClient,
  PluginRpcResult,
} from "@get-bb/plugin-sdk/app";

import type { FileManagerContract } from "../contract";
import { toFileManagerError } from "./errors";

export type FileManagerRpcMethod = Extract<keyof FileManagerContract, string>;
export type FileManagerRpcClient = PluginRpcClient<FileManagerContract>;

export type RpcInput<M extends FileManagerRpcMethod> = PluginRpcCallArgs<
  FileManagerContract[M]
>[0];
export type RpcOutput<M extends FileManagerRpcMethod> = PluginRpcResult<
  FileManagerContract[M]
>;

export interface FileManagerRpc {
  call<M extends FileManagerRpcMethod>(
    method: M,
    ...args: PluginRpcCallArgs<FileManagerContract[M]>
  ): Promise<RpcOutput<M>>;
  raw: FileManagerRpcClient;
}

export function wrapRpc(client: FileManagerRpcClient): FileManagerRpc {
  return {
    raw: client,
    async call<M extends FileManagerRpcMethod>(
      method: M,
      ...args: PluginRpcCallArgs<FileManagerContract[M]>
    ): Promise<RpcOutput<M>> {
      try {
        return await client.call(method, ...args);
      } catch (error) {
        throw toFileManagerError(error);
      }
    },
  };
}

export function useFmRpc(): FileManagerRpc {
  const client = useRpc<FileManagerContract>();
  const clientRef = useRef(client);
  clientRef.current = client;

  return useMemo(() => {
    const stable: FileManagerRpcClient = {
      call<M extends FileManagerRpcMethod>(
        method: M,
        ...args: PluginRpcCallArgs<FileManagerContract[M]>
      ): Promise<RpcOutput<M>> {
        return clientRef.current.call(method, ...args);
      },
    };
    return wrapRpc(stable);
  }, []);
}
