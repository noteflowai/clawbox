{{/*
Define ingress annotations
*/}}
{{- define "ingress.annotations" -}}
{{- if .Values.global.canary }}nginx.ingress.kubernetes.io/canary: "{{.Values.global.canary}}"
nginx.ingress.kubernetes.io/canary-weight: "10" {{ print "\n" }}
{{- end -}}
{{- end -}}


{{/*
Define url function named 'urlWithPath' that takes a url with path.
*/}}
{{- define "urlWithPath" -}}
    {{- $arg0 := index . 0 -}}
    {{- $arg01 := index . 1 -}}
    {{- $parsedUrl := urlParse $arg0 }}
    {{- printf "%s://%s@%s/%s?%s" $parsedUrl.scheme $parsedUrl.userinfo $parsedUrl.host $arg01 $parsedUrl.query -}}
{{- end -}}

{{- define "urlHostPort" -}}
    {{- $parsedUrl := urlParse . }}
    {{- print $parsedUrl.host -}}
{{- end -}}


{{- define "urlHost" -}}
    {{- $parsedUrl := urlParse . }}
    {{- $hostDetails :=  split ":" $parsedUrl.host }}
    {{- print $hostDetails._0 -}}
{{- end -}}

{{- define "urlPort" -}}
    {{- $parsedUrl := urlParse . }}
    {{- $hostDetails :=  split ":" $parsedUrl.host }}
    {{- print $hostDetails._1 -}}
{{- end -}}

{{- define "urlUser" -}}
    {{- $parsedUrl := urlParse . }}
    {{- $userDetails :=  split ":" $parsedUrl.userinfo }}
    {{- print $userDetails._0 -}}
{{- end -}}

{{- define "urlPassword" -}}
    {{- $parsedUrl := urlParse . }}
    {{- $userDetails :=  split ":" $parsedUrl.userinfo }}
    {{- print $userDetails._1 -}}
{{- end -}}

{{- define "urlPath" -}}
    {{- $parsedUrl := urlParse . }}
    {{- $path := substr 1 (len $parsedUrl.path) $parsedUrl.path -}}
    {{- print $path  -}}
{{- end -}}

{{- define "urlQuery" -}}
    {{- $parsedUrl := urlParse . }}
    {{- print $parsedUrl.query -}}
{{- end -}}
