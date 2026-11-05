import { createElement } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, ElementType } from "react";

type GlassPanelProps<T extends ElementType> = {
  as?: T;
  className?: string;
  opacity?: number;
  blur?: number;
  borderOpacity?: number;
  highlight?: number;
  shadow?: number;
  radius?: number;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

export function GlassPanel<T extends ElementType = "div">({
  as,
  className = "",
  opacity,
  blur,
  borderOpacity,
  highlight,
  shadow,
  radius,
  style,
  ...props
}: GlassPanelProps<T>) {
  const Tag = as ?? "div";
  const glassStyle = {
    ...style,
    ...(opacity === undefined ? {} : { "--lm-glass-opacity": opacity / 100 }),
    ...(blur === undefined ? {} : { "--lm-glass-blur": `${blur}px` }),
    ...(borderOpacity === undefined ? {} : { "--lm-glass-border-opacity": borderOpacity / 100 }),
    ...(highlight === undefined ? {} : { "--lm-glass-highlight": highlight / 100 }),
    ...(shadow === undefined ? {} : { "--lm-glass-shadow": shadow / 100 }),
    ...(radius === undefined ? {} : { "--lm-panel-radius": `${radius}px` }),
  } as CSSProperties;

  return createElement(Tag, {
    ...props,
    className: `glass-panel${className ? ` ${className}` : ""}`,
    style: glassStyle,
  });
}
