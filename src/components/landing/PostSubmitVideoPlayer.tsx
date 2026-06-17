import { VideoPlayer } from "@/components/VideoPlayer";

interface PostSubmitVideoPlayerProps {
  videoUrl: string;
  thumbnailUrl?: string | null;
  allowSeek?: boolean;
  allowSpeed?: boolean;
  /** video_assets.id — required for view tracking */
  videoId?: string | null;
  /** landing_pages.id — tagged on the view event as source_id */
  landingPageId?: string | null;
}

export const PostSubmitVideoPlayer = ({
  videoUrl,
  thumbnailUrl,
  allowSeek = true,
  allowSpeed = true,
  videoId,
  landingPageId,
}: PostSubmitVideoPlayerProps) => {
  return (
    <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
      <VideoPlayer
        src={videoUrl}
        poster={thumbnailUrl || undefined}
        allowSeek={allowSeek}
        allowPlaybackSpeed={allowSpeed}
        autoplay
        tracking={
          videoId
            ? { videoId, sourceType: "landing", sourceId: landingPageId ?? null }
            : undefined
        }
      />
    </div>
  );
};
