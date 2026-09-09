'use client';

import { useEffect } from 'react';
import { applySettings, loadSettings } from '@/lib/settings';

export function SettingsBoot() {
  useEffect(() => { applySettings(loadSettings()); }, []);
  return null;
}