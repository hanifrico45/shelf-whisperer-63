import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { publicCoverUrl, signedCoverUrl } from "@/lib/inventory";
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
  const publicUrl = publicCoverUrl(path);
  const [url, setUrl] = useState<string | null>(publicUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setUrl(publicCoverUrl(path));
    signedCoverUrl(path).then((signed) => {
      if (active && signed) setUrl(signed);
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
      {url && !failed ? (
        <img
          src={url}
          alt={alt}
          className="size-full object-cover"
          loading="lazy"
          onError={() => {
            if (url && publicUrl && url !== publicUrl) {
              setUrl(publicUrl);
              return;
            }
            setFailed(true);
          }}
        />
      ) : (
        <ImageIcon className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}
