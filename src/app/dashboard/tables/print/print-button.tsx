"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer size={16} /> Print
    </Button>
  );
}
