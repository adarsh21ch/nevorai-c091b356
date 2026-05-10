import * as React from "react";
import {
  Link as TLink,
  useLocation as useTLocation,
  useRouter,
  useParams as useTParams,
  useSearch,
} from "@tanstack/react-router";

// Drop-in Link
export const Link = React.forwardRef<HTMLAnchorElement, any>(
  ({ to, children, replace, state, ...rest }, ref) => {
    return (
      <TLink ref={ref as any} to={to as any} {...rest}>
        {children}
      </TLink>
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
  ({ to, className, children, end, ...rest }, ref) => {
    const loc = useTLocation();
    const isActive = end ? loc.pathname === to : loc.pathname === to || loc.pathname.startsWith(to + "/");
    const args = { isActive, isPending: false };
    const cls = typeof className === "function" ? className(args) : className;
    const kids = typeof children === "function" ? (children as any)(args) : children;
    return (
      <TLink ref={ref as any} to={to as any} className={cls} {...rest}>
        {kids}
      </TLink>
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
