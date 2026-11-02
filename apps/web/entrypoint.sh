#!/bin/bash

set -e

echo "#" "Starting web."


REPLACE_FLAG_FILE=/usr/share/nginx/envs-replaced
if [ ! -f "$REPLACE_FLAG_FILE" ]; then
  echo "#" "Start string substitutions in html, js and css assets."

  envsubst '${APP_VERSION} ${RESOURCE_PATH_PREFIX}' < /etc/nginx/conf.d/default.template > /etc/nginx/conf.d/default.conf

  sed "s;/__PUBLIC_URL__;${PUBLIC_URL};g" -i /usr/share/nginx/html/index.html

  js_files=$(find /usr/share/nginx/html/assets/ -type f -name "*.js")

  env_vars=$(grep -hoP "'ENV_[^']*'|\"ENV_[^\"]*\"" $js_files | sed "s/[\"']//g" | sed "s/^ENV_//" | grep -v '^$' | sort -u)

  echo "#" "Found env vars:\n${env_vars}"

  script_block="<script>
  (function (window) {
    window['config'] = window['config'] || {};
    "
    for var in $env_vars; do
      value=$(printenv $var || true)
      value="${value:-}"
      script_block="$script_block  window['config']['$var'] = '${value}';
    "
    done
    script_block="${script_block}})(this);
  </script>
  "
  echo $script_block > script_block.tmp
  sed -r "/<head>/r script_block.tmp" -i /usr/share/nginx/html/index.html
  rm script_block.tmp

  for style in `ls /usr/share/nginx/html/assets/*.css`;
    do
      sed -i "s|/__PUBLIC_URL__|${PUBLIC_URL}|g" $style
  done
  for style in `ls /usr/share/nginx/html/assets/*.js`;
    do
      sed -i "s|/__PUBLIC_URL__|${PUBLIC_URL}|g" $style
  done

  touch $REPLACE_FLAG_FILE
  echo "#" "Interpolating environment variables done"
else
  echo "#" "Interpolating environment variables already done"
fi

echo "#" "Starting HTTP fileserver nginx"

exec nginx -g 'daemon off;'
