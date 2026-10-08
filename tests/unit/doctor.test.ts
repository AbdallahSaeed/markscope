import { diagnose, findTodos } from '@/analysis/doctor'
import { render } from '../helpers/render'

function run(source: string, extraIds: string[] = [], broken: string[] = []) {
  const r = render(source)
  const ids = new Set([...r.headings.map(h => h.id), ...extraIds])
  return diagnose({
    source,
    headings: r.headings,
    links: r.links,
    images: r.images,
    knownIds: ids,
    brokenImages: new Set(broken),
  })
}

describe('document doctor', () => {
  test('clean document has no issues', () => {
    expect(
      run('# Title\n\n## Section\n\nSee [section](#section).\n\n![Logo](l.png)'),
    ).toEqual([])
  })

  test('broken anchors are errors; valid and encoded anchors pass', () => {
    const issues = run('# A\n\n[ok](#a) [bad](#nope) [enc](#%C3%BCber)\n\n## Über')
    expect(issues.filter(i => i.rule === 'broken-anchor').map(i => i.message)).toEqual([
      'Anchor #nope does not match any heading or id',
    ])
  })

  test('heading jumps, multiple h1s, empty and duplicate headings', () => {
    const rules = run('# A\n### Skipped\n# B\n## Dup\n## Dup\n## \n').map(i => i.rule)
    expect(rules).toEqual(
      expect.arrayContaining([
        'heading-increment',
        'single-h1',
        'duplicate-heading',
        'empty-heading',
      ]),
    )
  })

  test('links: empty target, missing text, insecure http', () => {
    const rules = run('[]() [](https://a.com) [x](http://insecure.com)').map(i => i.rule)
    expect(rules).toEqual(
      expect.arrayContaining(['empty-link', 'link-text', 'insecure-link']),
    )
  })

  test('images: alt text and broken images', () => {
    const issues = run('![](a.png)\n\n![ok](b.png)', [], ['b.png'])
    expect(issues.map(i => i.rule)).toEqual(['broken-image', 'image-alt'])
  })

  test('errors sort before warnings before info', () => {
    const sev = run('# A\n### B\n[x](#missing)\nTODO: write').map(i => i.severity)
    expect(sev).toEqual(
      [...sev].sort(
        (a, b) =>
          ['error', 'warning', 'info'].indexOf(a) -
          ['error', 'warning', 'info'].indexOf(b),
      ),
    )
  })

  test('TODO markers with line numbers, flagged when inside code', () => {
    const todos = findTodos('intro\nTODO: ship it\n```\nFIXME later\n```\nXXX')
    expect(todos.map(t => [t.line, t.message])).toEqual([
      [2, 'TODO: ship it'],
      [4, 'FIXME: later (in code)'],
      [6, 'XXX'],
    ])
  })
})
