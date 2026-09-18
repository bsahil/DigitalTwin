import { useEffect, useMemo, useState } from 'react';
import { HumanMesh, loadHumanAsset, type HumanAsset } from '../lib/humanMesh';

/** One download per page: the asset is ~1.5 MB and never changes. */
let assetPromise: Promise<HumanAsset> | null = null;

export function humanAssetUrl(): string {
  return `${import.meta.env.BASE_URL}body/`;
}

export function useHumanAsset(): { asset: HumanAsset | null; error: string | null } {
  const [asset, setAsset] = useState<HumanAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    assetPromise ??= loadHumanAsset(humanAssetUrl());
    assetPromise.then(
      (a) => alive && setAsset(a),
      (e) => alive && setError(String(e)),
    );
    return () => {
      alive = false;
    };
  }, []);
  return { asset, error };
}

/** A mesh instance per screen: its geometry is mutated by the fit, so it is never shared. */
export function useHumanMesh(): { human: HumanMesh | null; error: string | null } {
  const { asset, error } = useHumanAsset();
  const human = useMemo(() => (asset ? new HumanMesh(asset) : null), [asset]);
  return { human, error };
}
