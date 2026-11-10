import { describe, expect, it } from 'vitest';

import { generateSceneContent } from '@openmaic/generation';
import type { AICallFn, SceneOutline } from '@openmaic/generation';

const outline: SceneOutline = {
  id: 'scene-widget',
  type: 'interactive',
  title: 'Orbit Explorer',
  description: 'Explore an orbit.',
  keyPoints: ['Drag the planet'],
  order: 0,
  widgetType: 'simulation',
  widgetOutline: { concept: 'Orbits', keyVariables: ['speed'] },
};

function capture() {
  const systems: string[] = [];
  const aiCall: AICallFn = async (system) => {
    systems.push(system);
    return '<!DOCTYPE html><html><body><div id="speed-slider"></div></body></html>';
  };
  return { systems, aiCall };
}

describe('widgetDirective (fork)', () => {
  it('appends skill guidance after the built-in widget prompt', async () => {
    const { systems, aiCall } = capture();
    await generateSceneContent(outline, aiCall, { widgetDirective: 'USE THREE.JS WISELY' });
    expect(systems).toHaveLength(1);
    const system = systems[0];
    expect(system).toContain('## Active Skill: Additional Build Guidance');
    expect(system.indexOf('USE THREE.JS WISELY')).toBeGreaterThan(
      system.indexOf('# Simulation Widget Content Generator'),
    );
  });

  it('leaves the upstream prompt untouched without a directive', async () => {
    const { systems, aiCall } = capture();
    await generateSceneContent(outline, aiCall, { widgetDirective: '   ' });
    expect(systems[0]).not.toContain('Active Skill');
    expect(systems[0]).not.toContain('Apple');
  });
});

describe('reviewInteractive (fork)', () => {
  // Layout repairs only run when skill guidance shaped the page.
  const SKILL = 'NIE DESIGN';
  const page = (marker: string) =>
    `<!DOCTYPE html><html><body><div id="speed-slider">${marker}</div></body></html>`;

  it('without a patcher, rewrites once with the issues and screenshot', async () => {
    const calls: { user: string; images?: Array<{ id: string; src: string }> }[] = [];
    const aiCall: AICallFn = async (_system, user, images) => {
      calls.push({ user, images });
      return calls.length === 1 ? page('FIRST') : page('FIXED');
    };
    let r = 0;
    const content = await generateSceneContent(outline, aiCall, {
      widgetDirective: SKILL,
      reviewInteractive: async () =>
        r++ === 0
          ? { issues: ['The page scrolls vertically by 240px.'], screenshot: 'data:image/png;base64,AAAA' }
          : { issues: [] },
    });
    expect(calls).toHaveLength(2); // generate + ONE rewrite
    expect(calls[1].user).toContain('The page scrolls vertically by 240px.');
    expect(calls[1].user).toContain('FIRST');
    expect(calls[1].images?.[0].src).toBe('data:image/png;base64,AAAA');
    expect(content && 'html' in content && content.html).toContain('FIXED');
  });

  it('uses the fast patcher for layout problems and never calls the page model again', async () => {
    let n = 0;
    const aiCall: AICallFn = async () => {
      n += 1;
      return page('ORIGINAL');
    };
    let r = 0;
    const content = await generateSceneContent(outline, aiCall, {
      widgetDirective: SKILL,
      reviewInteractive: async () => ({ issues: r++ === 0 ? ['panel overflows'] : [] }),
      repairInteractive: async (html) => html.replace('ORIGINAL', 'PATCHED'),
    });
    expect(n).toBe(1);
    expect(content && 'html' in content && content.html).toContain('PATCHED');
  });

  it('rewrites instead of patching when the review says a rewrite is needed', async () => {
    let n = 0;
    const aiCall: AICallFn = async () => page(++n === 1 ? 'ZH' : 'EN');
    let patched = false;
    let r = 0;
    const content = await generateSceneContent(outline, aiCall, {
      widgetDirective: SKILL,
      reviewInteractive: async () =>
        r++ === 0 ? { issues: ['Chinese text'], needsRewrite: true } : { issues: [] },
      repairInteractive: async (html) => {
        patched = true;
        return html;
      },
    });
    expect(patched).toBe(false);
    expect(n).toBe(2);
    expect(content && 'html' in content && content.html).toContain('EN');
  });

  it('keeps the page when the review passes or cannot run', async () => {
    for (const review of [async () => ({ issues: [] }), async () => { throw new Error('no browser'); }]) {
      let n = 0;
      const aiCall: AICallFn = async () => {
        n += 1;
        return page('ONLY');
      };
      const content = await generateSceneContent(outline, aiCall, { reviewInteractive: review });
      expect(n).toBe(1);
      expect(content && 'html' in content && content.html).toContain('ONLY');
    }
  });

  it('keeps the original when the repair returns nothing or makes it worse', async () => {
    const aiCall: AICallFn = async () => page('ORIGINAL');
    let r = 0;
    const worse = await generateSceneContent(outline, aiCall, {
      widgetDirective: SKILL,
      reviewInteractive: async () => ({ issues: r++ === 0 ? ['a'] : ['a', 'b'] }),
      repairInteractive: async () => page('WORSE'),
    });
    expect(worse && 'html' in worse && worse.html).toContain('ORIGINAL');
    const none = await generateSceneContent(outline, aiCall, {
      widgetDirective: SKILL,
      reviewInteractive: async () => ({ issues: ['a'] }),
      repairInteractive: async () => null,
    });
    expect(none && 'html' in none && none.html).toContain('ORIGINAL');
  });
});

describe('reviewInteractive without skill guidance (fork)', () => {
  const page = (marker: string) =>
    `<!DOCTYPE html><html><body><div id="speed-slider">${marker}</div></body></html>`;

  it('leaves layout findings alone so the page keeps the upstream look', async () => {
    let n = 0;
    const aiCall: AICallFn = async () => {
      n += 1;
      return page('UPSTREAM');
    };
    let patched = false;
    const content = await generateSceneContent(outline, aiCall, {
      reviewInteractive: async () => ({
        issues: ['The page scrolls (240px vertically).', 'Text "x" is 11px; nothing on the stage may be smaller than 12px.'],
        blockingIssues: [],
      }),
      repairInteractive: async (html) => {
        patched = true;
        return html;
      },
    });
    expect(patched).toBe(false);
    expect(n).toBe(1);
    expect(content && 'html' in content && content.html).toContain('UPSTREAM');
  });

  it('rewrites for real faults only, listing just those faults', async () => {
    const users: string[] = [];
    const aiCall: AICallFn = async (_system, user) => {
      users.push(user);
      return page(users.length === 1 ? 'ZH' : 'EN');
    };
    let patched = false;
    let r = 0;
    const content = await generateSceneContent(outline, aiCall, {
      reviewInteractive: async () =>
        r++ === 0
          ? {
              issues: ['The page scrolls (240px vertically).', 'JavaScript error while running the page: boom'],
              blockingIssues: ['JavaScript error while running the page: boom'],
              needsRewrite: true,
            }
          : { issues: ['The page scrolls (240px vertically).'], blockingIssues: [] },
      repairInteractive: async (html) => {
        patched = true;
        return html;
      },
    });
    expect(patched).toBe(false);
    expect(users).toHaveLength(2);
    expect(users[1]).toContain('JavaScript error while running the page: boom');
    expect(users[1]).not.toContain('The page scrolls');
    expect(content && 'html' in content && content.html).toContain('EN');
  });
});
