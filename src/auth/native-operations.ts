import { supabase } from "./client";
import { createOperationManager } from "./operation-scope";

export const customerOperations = createOperationManager(
  supabase
    ? {
        async read() {
          const { data, error } = await supabase!.auth.getSession();
          if (error) throw error;
          return data.session;
        },
        subscribe(callback) {
          const { data } = supabase!.auth.onAuthStateChange((_event, session) =>
            callback(session),
          );
          return () => data.subscription.unsubscribe();
        },
      }
    : null,
);
