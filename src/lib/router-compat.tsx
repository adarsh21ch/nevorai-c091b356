import * as React from "react";
import {
  useLocation as useTLocation,
  useRouter,
  useParams as useTParams,
  useSearch,
} from "@tanstack/react-router";

// Drop-in Link
// React Router DOM lets you write <Link to="/funnels/abc/edit"> with a
// concrete URL. TanStack's <Link to="..."> expects the ROUTE PATTERN
// ("/funnels/$id/edit") + params={{id:"abc"}}; given a literal URL it
// renders a plain <a href> which causes a full page reload on click.
// To preserve react-router-dom semantics across the app we render an
// anchor and SPA-navigate via the router on click.
export const Link = React.forwardRef<HTMLAnchorElement, any>(
  ({ to, children, replace, state: _state, target, onClick, ...rest }, ref) => {
    const router = useRouter();
    const href = typeof to === "string" ? to : "#";
    const isExternal =
      typeof to === "string" &&
      (to.startsWith("http://") || to.startsWith("https://") || to.startsWith("mailto:") || to.startsWith("tel:"));
    const opensNewTab = target && target !== "_self";

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (isExternal || opensNewTab) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      router.navigate({ to: href as any, replace: !!replace });
    };

    return (
      <a ref={ref as any} href={href} target={target} onClick={handleClick} {...rest}>
        {children}
      </a>
    );
  },
);
Link.displayName = "Link";

// NavLink — react-router-dom style with active/pending render-prop className
export interface NavLinkProps {
  to: string;
  className?: string | ((args: { isActive: boolean; isPending: boolean }) => string);
  children?: React.ReactNode | ((args: { isActive: boolean; isPending: boolean }) => React.ReactNode);
  end?: boolean;
  replace?: boolean;
  state?: any;
  [key: string]: any;
}

export const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ to, className, children, end, replace, target, onClick, ...rest }, ref) => {
    const router = useRouter();
    const loc = useTLocation();
    const isActive = end ? loc.pathname === to : loc.pathname === to || loc.pathname.startsWith(to + "/");
    const args = { isActive, isPending: false };
    const cls = typeof className === "function" ? className(args) : className;
    const kids = typeof children === "function" ? (children as any)(args) : children;
    const isExternal = to.startsWith("http://") || to.startsWith("https://") || to.startsWith("mailto:") || to.startsWith("tel:");
    const opensNewTab = target && target !== "_self";
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (isExternal || opensNewTab) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      router.navigate({ to: to as any, replace: !!replace });
    };
    return (
      <a ref={ref as any} href={to} target={target} className={cls} onClick={handleClick} {...rest}>
        {kids}
      </a>
    );
  },
);
NavLink.displayName = "NavLink";

export const useNavigate = () => {
  const router = useRouter();
  return (path: string | number, opts?: any) => {
    if (typeof path === "number") {
      if (typeof window !== "undefined") window.history.go(path);
      return;
    }
    router.navigate({ to: path as any, ...(opts || {}) });
  };
};

export const useLocation = () => {
  const loc = useTLocation();
  return { pathname: loc.pathname, search: loc.search, hash: loc.hash, state: undefined };
};

export const useParams = <T extends Record<string, string> = Record<string, string>>() => {
  const params = useTParams({ strict: false }) as Record<string, string>;
  return params as T;
};

// react-router-dom-style useSearchParams
export const useSearchParams = (): [URLSearchParams, (next: URLSearchParams | Record<string, string>) => void] => {
  const router = useRouter();
  const loc = useTLocation();
  const params = React.useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, [loc.search]);
  const setParams = (next: URLSearchParams | Record<string, string>) => {
    const sp = next instanceof URLSearchParams ? next : new URLSearchParams(next);
    const search = sp.toString();
    router.navigate({ to: loc.pathname as any, search: search ? Object.fromEntries(sp) : ({} as any) });
  };
  return [params, setParams];
};

// <Navigate to="..." replace state={...} />
export const Navigate = ({ to, replace }: { to: string; replace?: boolean; state?: any }) => {
  const router = useRouter();
  React.useEffect(() => {
    router.navigate({ to: to as any, replace });
  }, [to, replace]);
  return null;
};

// <Outlet /> compat — alias TanStack's Outlet
export { Outlet } from "@tanstack/react-router";
