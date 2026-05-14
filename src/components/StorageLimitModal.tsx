import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@/lib/router-compat";
import { HardDrive, ArrowRight } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  usedGB: number;
  limitGB: number;
}

export const StorageLimitModal = ({ open, onClose, usedGB, limitGB }: Props) => {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <HardDrive size={22} />
          </div>
          <DialogTitle className="text-center font-heading">Storage limit reached</DialogTitle>
          <DialogDescription className="text-center">
            You've used <span className="font-semibold text-foreground">{usedGB.toFixed(2)} of {limitGB.toFixed(1)} GB</span>.
            Upgrade to keep uploading.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="hero"
            onClick={() => {
              onClose();
              navigate("/pricing");
            }}
          >
            See Plans <ArrowRight size={14} />
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
