import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The lecture JSON is read at request time by path, which tracing cannot
  // infer, so name it explicitly or the deployed build ships without it.
  outputFileTracingIncludes: {
    "/library": ["./data/lectures/**"],
    "/": ["./data/lectures/**"],
  },
};

export default nextConfig;
