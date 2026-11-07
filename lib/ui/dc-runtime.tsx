import React from 'react';

/*
 * The component contract the original pages were written against, ported from
 * archive/showup-standalone/standalone-support.js §4 ("DCLogic base class and host component").
 * The template compiler from that file is gone: the JSX in components/ replaces it.
 *
 * ┌─ INTENTIONAL, DO NOT "FIX" ──────────────────────────────────────────────────────────────┐
 * │ logic.setState(patch) replaces logic.state SYNCHRONOUSLY, and only then asks React to    │
 * │ re-render. The ported logic depends on this: it reads this.state straight after          │
 * │ setState (e.g. editChip() then patchSheet() in lib/ui/flow/conditions-sheet.ts, or       │
 * │ setState() then change() in respond.ts). Turning these classes into a plain              │
 * │ React.Component or useState would make those reads stale and silently drop updates.     │
 * │ Likewise componentDidUpdate receives only prevProps, never prevState: the logic tracks   │
 * │ its previous state itself (this._prev). Keep both until the logic is refactored as a     │
 * │ whole.                                                                                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 */
export class DCLogic {
  [key: string]: any;
  constructor(props?: any) {
    this.props = props || {};
    this.state = {};
  }
  setState(patch: any, cb?: () => void) {
    if (this.__host) this.__host.__setLogicState(patch, cb);
  }
  forceUpdate() {
    if (this.__host) this.__host.forceUpdate();
  }
  componentDidMount() {}
  componentDidUpdate(_prevProps?: any) {}
  componentWillUnmount() {}
  renderVals(): any {
    return {};
  }
}

function userProps(p: any) {
  const o: any = {};
  Object.keys(p).forEach((k) => {
    if (k.indexOf('__') !== 0) o[k] = p[k];
  });
  return o;
}

/* Builds the page component: div#dc-root > div.sc-host[data-sc-name] > render(renderVals()), the same
   DOM wrappers the standalone runtime produced. `render` is the page's JSX (it replaces the template). */
export function createDCPage(name: string, Logic: any, render: (v: any) => React.ReactNode) {
  class Host extends React.Component<any, { __v: number }> {
    logic: any;
    constructor(props: any) {
      super(props);
      this.state = { __v: 0 };
      try {
        this.logic = new Logic(userProps(props));
      } catch (e) {
        console.error(e);
        this.logic = new DCLogic(userProps(props));
      }
      this.logic.__host = this;
    }
    __setLogicState(patch: any, cb?: () => void) {
      // See the INTENTIONAL note above: state is replaced now, React re-renders after.
      const prev = this.logic.state,
        upd = typeof patch === 'function' ? patch(prev) : patch;
      this.logic.state = Object.assign({}, prev, upd);
      this.setState((d) => ({ __v: d.__v + 1 }), cb);
    }
    componentDidMount() {
      try {
        this.logic.componentDidMount();
      } catch (e) {
        console.error(e);
      }
    }
    componentDidUpdate(prevProps: any) {
      this.logic.props = userProps(this.props);
      // Only prevProps is passed on, as in the original runtime (see note above).
      try {
        this.logic.componentDidUpdate(prevProps);
      } catch (e) {
        console.error(e);
      }
    }
    componentWillUnmount() {
      try {
        this.logic.componentWillUnmount();
      } catch (e) {
        console.error(e);
      }
    }
    render() {
      const p = userProps(this.props);
      this.logic.props = p;
      let vals = p;
      try {
        vals = Object.assign({}, p, this.logic.renderVals() || {});
      } catch (e) {
        console.error(name + '.renderVals():', e);
      }
      return (
        <div className="sc-host" data-sc-name={name}>
          {render(vals)}
        </div>
      );
    }
  }
  return function DCPage(props: any) {
    return (
      <div id="dc-root">
        <Host {...props} />
      </div>
    );
  };
}
