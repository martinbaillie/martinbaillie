;; Automatically export to Hugo markdown on save.
((org-mode . ((eval . (org-hugo-auto-export-mode))))
 ;; Automatically generate diagrams from source on save.
 ("src/diagrams"
  (python-mode . ((eval add-hook 'after-save-hook
                        '(lambda () (compile
                                (concat "python " (buffer-name))))  nil t)))))
