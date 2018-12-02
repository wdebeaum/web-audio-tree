#!/usr/bin/ruby

require 'github/markup';
file = ARGV[0]
$stdout.write(
  "<!DOCTYPE html>\n<html><meta charset=\"utf-8\">\n" +
  "<link rel=\"stylesheet\" type=\"text/css\" href=\"doc.css\">\n" +
  GitHub::Markup.render(file, IO.read(file)).
  gsub(/<pre><code>/, "<code><pre>").
  gsub(/<\/code><\/pre>/, "</pre></code>") +
  "<html>\n")

