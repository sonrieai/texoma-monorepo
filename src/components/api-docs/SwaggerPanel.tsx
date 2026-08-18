"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export function SwaggerPanel() {
  return (
    <SwaggerUI
      url="/api/openapi"
      docExpansion="list"
      defaultModelsExpandDepth={0}
      displayOperationId={false}
      tryItOutEnabled
      filter
      persistAuthorization
    />
  );
}
