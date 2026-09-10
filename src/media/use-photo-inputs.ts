import { useEffect, useRef } from "react";
import { demo } from "../config";
import { useEditOperation } from "../editor/use-edit-operation";
import type { OperationScope } from "../auth/operation-scope";
import { OperationStopped } from "../auth/operation-scope";
import { chooseFloorplan, choosePhotos } from "../media";
import { createNativeInputOwner } from "./native-inputs";

export function usePhotoInputs(userId: string | undefined) {
  const begin = useEditOperation(userId);
  const renderedUser = useRef(userId);
  renderedUser.current = userId;
  const current = useRef<{
    owner: ReturnType<typeof createNativeInputOwner>;
    operation: OperationScope;
  } | null>(null);
  useEffect(
    () => () => {
      current.current?.owner.close();
      current.current?.operation.dispose();
      current.current = null;
    },
    [userId],
  );
  async function owner() {
    if (renderedUser.current !== userId) throw new OperationStopped();
    if (current.current && !current.current.operation.current) {
      current.current.owner.close();
      current.current.operation.dispose();
      current.current = null;
    }
    if (!current.current) {
      const operation = begin();
      current.current = {
        operation,
        owner: createNativeInputOwner(
          operation.signal,
          operation.assertCurrent,
        ),
      };
    }
    const selected = current.current;
    selected.operation.assertCurrent();
    if (!demo) await selected.operation.getToken();
    selected.operation.assertCurrent();
    return selected.owner;
  }
  return {
    choosePhotos: async (limit = 1, camera = false) =>
      (await owner()).run((transaction) =>
        choosePhotos(transaction, limit, camera),
      ),
    chooseFloorplan: async () =>
      (await owner()).run((transaction) => chooseFloorplan(transaction)),
  };
}
