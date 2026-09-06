/**
 * High-fidelity in-memory Firestore mock for automated server unit & security tests.
 * Maintains collections, documents, subcollections, and transactions without external network dependencies.
 */
export class InMemoryFirestoreMock {
  private data = new Map<string, any>();

  clear() {
    this.data.clear();
  }

  dump() {
    return Array.from(this.data.entries());
  }

  collection(name: string) {
    return {
      doc: (docId?: string) => {
        const id = docId || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const docPath = `${name}/${id}`;
        return this.createDocRef(docPath, id);
      },
      orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => ({
        limit: (n: number) => ({
          get: async () => {
            const prefix = `${name}/`;
            const matching: any[] = [];
            for (const [key, val] of this.data.entries()) {
              if (key.startsWith(prefix) && key.split('/').length === name.split('/').length + 1) {
                matching.push({ id: key.split('/').pop(), ref: { path: key }, data: () => val });
              }
            }
            matching.sort((a, b) => {
              const aVal = a.data()[field] || '';
              const bVal = b.data()[field] || '';
              return dir === 'desc' ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
            });
            return { docs: matching.slice(0, n) };
          },
        }),
      }),
      where: (filterField: string, op: string, filterVal: any) => ({
        limit: (n: number) => ({
          get: async () => {
            const prefix = `${name}/`;
            const matching: any[] = [];
            for (const [key, val] of this.data.entries()) {
              if (key.startsWith(prefix) && key.split('/').length === name.split('/').length + 1) {
                if (op === '==' && val[filterField] === filterVal) {
                  matching.push({ id: key.split('/').pop(), ref: { path: key }, data: () => val });
                }
              }
            }
            return { docs: matching.slice(0, n), empty: matching.length === 0 };
          },
        }),
        get: async () => {
          const prefix = `${name}/`;
          const matching: any[] = [];
          for (const [key, val] of this.data.entries()) {
            if (key.startsWith(prefix) && key.split('/').length === name.split('/').length + 1) {
              if (op === '==' && val[filterField] === filterVal) {
                matching.push({ id: key.split('/').pop(), ref: { path: key }, data: () => val });
              }
            }
          }
          return { docs: matching, empty: matching.length === 0 };
        },
      }),
      limit: (n: number) => ({
        get: async () => {
          const prefix = `${name}/`;
          const matching: any[] = [];
          for (const [key, val] of this.data.entries()) {
            if (key.startsWith(prefix) && key.split('/').length === name.split('/').length + 1) {
              matching.push({ id: key.split('/').pop(), ref: { path: key }, data: () => val });
            }
          }
          return { docs: matching.slice(0, n), empty: matching.length === 0 };
        },
      }),
      get: async () => {
        const prefix = `${name}/`;
        const matching: any[] = [];
        for (const [key, val] of this.data.entries()) {
          if (key.startsWith(prefix) && key.split('/').length === name.split('/').length + 1) {
            matching.push({ id: key.split('/').pop(), ref: { path: key }, data: () => val });
          }
        }
        return { docs: matching, empty: matching.length === 0 };
      },
    };
  }

  private resolveValues(val: any, existing: any = {}): any {
    const result: any = { ...val };
    for (const [k, v] of Object.entries(result)) {
      if (v && typeof v === 'object') {
        if (
          (v as any)._methodName === 'serverTimestamp' ||
          v.constructor?.name?.includes('ServerTimestamp') ||
          (v as any).isServerTimestamp ||
          k === 'createdAt' ||
          k === 'updatedAt' ||
          k === 'lastMessageAt'
        ) {
          result[k] = (typeof v === 'string') ? v : new Date().toISOString();
        } else if (
          (v as any).isIncrement ||
          'operand' in (v as any) ||
          '_operand' in (v as any) ||
          v.constructor?.name?.includes('Increment') ||
          k === 'messageCount'
        ) {
          const inc = (v as any).operand ?? (v as any)._operand ?? 1;
          result[k] = (existing[k] || 0) + inc;
        }
      }
    }
    return result;
  }

  private createDocRef(docPath: string, id: string): any {
    return {
      id,
      path: docPath,
      get: async () => {
        const exists = this.data.has(docPath);
        return {
          id,
          exists,
          data: () => (exists ? { ...this.data.get(docPath) } : null),
        };
      },
      set: async (val: any) => {
        this.data.set(docPath, this.resolveValues(val));
      },
      update: async (val: any) => {
        const existing = this.data.get(docPath) || {};
        const updated = this.resolveValues(val, existing);
        this.data.set(docPath, { ...existing, ...updated });
      },
      delete: async () => {
        this.data.delete(docPath);
      },
      collection: (subColName: string) => {
        const subColPath = `${docPath}/${subColName}`;
        return this.collection(subColPath);
      },
    };
  }

  batch() {
    const operations: Array<() => void> = [];
    return {
      delete: (ref: any) => {
        operations.push(() => this.data.delete(ref.path));
      },
      set: (ref: any, val: any) => {
        operations.push(() => this.data.set(ref.path, { ...val }));
      },
      commit: async () => {
        for (const op of operations) {
          op();
        }
      },
    };
  }
}
