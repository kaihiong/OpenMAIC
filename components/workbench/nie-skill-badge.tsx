'use client';

/**
 * Fork: marks skills made by NIE (`metadata.publisher: NIE` in SKILL.md) so
 * teachers can tell them apart from OpenMAIC's built-in skills. Same sky tone
 * as the NIE welcome card.
 */
import { cn } from '@/lib/utils';
import type { AgentSkillInfo } from '@/lib/workbench/agent-skills';

export function isNieSkill(skill: Pick<AgentSkillInfo, 'publisher'>): boolean {
  return skill.publisher?.trim().toUpperCase() === 'NIE';
}

export function NieSkillBadge({
  skill,
  className,
}: {
  skill: Pick<AgentSkillInfo, 'publisher'>;
  className?: string;
}) {
  if (!isNieSkill(skill)) return null;
  return (
    <span
      data-testid="nie-skill-badge"
      title="Made by NIE"
      className={cn(
        'shrink-0 rounded bg-sky-100 px-1.5 py-px text-[10px] font-semibold tracking-wide text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
        className,
      )}
    >
      NIE
    </span>
  );
}
