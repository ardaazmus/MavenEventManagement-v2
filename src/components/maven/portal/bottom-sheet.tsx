"use client";
import React from "react";
import { Drawer } from "vaul";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";

export interface BottomSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function BottomSheet({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  className,
}: BottomSheetProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      haptic.light();
    }
    if (onOpenChange) {
      onOpenChange(nextOpen);
    }
  };

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      {trigger && <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity duration-300" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[88vh] flex-col rounded-t-[20px] bg-background border-t shadow-2xl focus:outline-hidden",
            className
          )}
        >
          {/* Native Drag Handle Pill */}
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted-foreground/30" />

          {/* Header */}
          {(title || description) && (
            <div className="px-5 pt-3 pb-2 text-center sm:text-left">
              {title && (
                <Drawer.Title className="text-base font-semibold text-foreground">
                  {title}
                </Drawer.Title>
              )}
              {description && (
                <Drawer.Description className="text-xs text-muted-foreground mt-0.5">
                  {description}
                </Drawer.Description>
              )}
            </div>
          )}

          {/* Body Content with Native Scrolling & Safe Area Padding */}
          <div className="flex-1 overflow-y-auto px-5 py-3 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
