import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { signedCoverUrl } from "@/lib/inventory";
import { cn } from "@/lib/utils";

export function CoverImage({
  path,
  alt,
  className,
}: {
  path: string | null;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    signedCoverUrl(path).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [path]);

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-md border border-border bg-muted",
        className,
      )}
    >
      {url ? (
        <img src={url} alt={alt} className="size-full object-cover" loading="lazy" />
      ) : (
        <ImageIcon className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}
