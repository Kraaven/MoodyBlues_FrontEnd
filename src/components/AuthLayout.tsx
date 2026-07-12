import type { ReactNode } from 'react';
import { Boxes } from 'lucide-react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between overflow-hidden bg-block-navy p-12 md:flex">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/70">Moody Blues</p>

        <div className="max-w-md">
          <h1 className="text-[40px] font-medium leading-[1.08] tracking-[-0.01em] text-white">
            Inspect every scene your players will see.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Upload, browse, and take apart your Unity scenes -- hierarchy, materials, textures, and
            geometry, right in the browser.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">
          <Boxes className="h-3.5 w-3.5" />
          GLB / GLTF Scene Inspector
        </div>
      </div>

      <div className="flex items-center justify-center bg-canvas px-6 py-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
