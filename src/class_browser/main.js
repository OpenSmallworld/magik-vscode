'use strict';

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.

/* eslint-disable */
(function main() {
  const vscode = acquireVsCodeApi();

  const methodInput = document.querySelector('#methodInput');
  const classInput = document.querySelector('#classInput');

  const connectButton = document.querySelector('.connect-button');
  let navigationElements = [];
  let selectedElement;

  connectButton.addEventListener('click', () => {
    vscode.postMessage({type: 'connect'});
  });
  connectButton.setAttribute('tabindex', -1);

  methodInput.addEventListener('input', debounce((e) => {
    vscode.postMessage({
      type: 'search',
      className: classInput.value,
      methodName: e.target.value,
    });
  }, 400));

  classInput.addEventListener('input', debounce((e) => {
    vscode.postMessage({
      type: 'search',
      className: e.target.value,
      methodName: methodInput.value,
    });
  }, 400));

  document.querySelector('#localButton').addEventListener('click', (e) => {
    infoButtonSelected(e.target, 'local');
  });

  document.querySelector('#argsButton').addEventListener('click', (e) => {
    infoButtonSelected(e.target, 'args');
  });

  document.querySelector('#commentsButton').addEventListener('click', (e) => {
    infoButtonSelected(e.target, 'comments');
  });

  document.onkeydown = (e) => {
    const elementsLength = navigationElements.length;
    const activeElement = document.activeElement;
    let newIndex;

    switch (e.key) {
      case 'Enter':
        if (selectedElement && selectedElement.getAttribute('data-method-name')) {
          handleMethodClicked(
            selectedElement.getAttribute('data-class-name'),
            selectedElement.getAttribute('data-method-name'),
            selectedElement.getAttribute('data-package-name'),
          );
        }
        break;
      case 'ArrowUp':
        if (activeElement === classInput) {

        } else if (activeElement === methodInput) {
          if (methodInput.selectionStart === 0) {
            classInput.focus();
            return false;
          }
        } else {
          const index = navigationElements.indexOf(selectedElement);
          if (index === 0) {
            selectedElement = undefined;
            methodInput.focus();
            return false;
          } else if (index > 0) {
            newIndex = index - 1;
          }
        }
        break;
      case 'ArrowDown':
        if (activeElement === methodInput || activeElement === classInput) {
          newIndex = 0;
        } else {
          const index = navigationElements.indexOf(selectedElement);
          newIndex = 0;
          if (index !== elementsLength - 1) {
            newIndex = index + 1;
          }
        }
        break;
      case 'ArrowLeft':
        if (activeElement === methodInput &&
          methodInput.selectionStart === 0 &&
          methodInput.selectionEnd === 0) {
          classInput.focus();
          return false;
        }
        break;
      case 'ArrowRight':
        if (activeElement === classInput &&
          classInput.selectionEnd === classInput.value.length &&
          classInput.selectionStart === classInput.selectionEnd) {
          methodInput.focus();
          return false;
        }
        break;
      default:
    }

    if (elementsLength === 0) {
      selectedElement = undefined;
    } else if (newIndex !== undefined) {
      selectedElement = navigationElements[newIndex];
      selectedElement.focus();
      return false;
    }
  };

  // Handle messages sent from the extension to the webview
  window.addEventListener('message', event => {
    const message = event.data; // The json data that the extension sent
    switch (message.type) {
      case 'updateResults':
        updateResultList(message.results, message.resultsLength);
        break;
      case 'clearResults':
        clearResultList();
        break;
      case 'enableSearch':
        enableSearch(message.enabled);
        break;
      case 'setFocus':
        if (!methodInput.classList.contains('disabled')) {
          methodInput.focus();
        }
        break;
      case 'search':
        search(message);
        break;
      default:
    }
  });

  function search(message) {
    methodInput.value = message.methodName;
    classInput.value = message.className;

    if (message.hasOwnProperty('local')) {
      setInfoButton('#localButton', message.local);
    }
    if (message.hasOwnProperty('args')) {
      setInfoButton('#argsButton', message.args);
    }
    if (message.hasOwnProperty('comments')) {
      setInfoButton('#commentsButton', message.comments);
    }

    vscode.postMessage({
      type: 'search',
      methodName: message.methodName,
      className: message.className,
    });
  }

  function infoButtonSelected(btn, name) {
    const methodName = methodInput.value;
    const className = classInput.value;
    const selected = btn.classList.contains('selected');

    if (selected) {
      btn.classList.remove('selected');
    } else {
      btn.classList.add('selected');
    }

    vscode.postMessage({type: 'setProperty', name, value: !selected});
    vscode.postMessage({type: 'search', methodName, className,});
  }

  function setInfoButton(selector, selected) {
    const btn = document.querySelector(selector);
    if (btn) {
      if (selected) {
        if (!btn.classList.contains('selected')) {
          btn.classList.add('selected');
        }
      } else {
        btn.classList.remove('selected');
      }
    }
  }

  function clearResultList() {
    document.querySelector('.results-list').textContent = '';
    document.querySelector('.results-length').textContent = '';
    navigationElements = []
    selectedElement = undefined;
  }

  function addText(parent, text, className) {
    const span = document.createElement('span');
    if (className) {
      span.className = className;
    }
    span.appendChild(document.createTextNode(text));
    parent.appendChild(span);
  }

  function updateResultList(results, resultsLength) {
    const list = document.querySelector('.results-list');

    const methodsLength = results.length;
    const navElements = [];

    if (resultsLength !== undefined) {
      document.querySelector('.results-length').textContent = `${resultsLength} results found`;
    }

    for (let methodIndex = 0; methodIndex < methodsLength; methodIndex++) {
      const methodData = results[methodIndex];

      const methodElement = document.createElement('li');
      methodElement.className = 'method-element';
      methodElement.setAttribute('tabindex', 0);
      methodElement.setAttribute('data-class-name', methodData.className);
      methodElement.setAttribute('data-method-name', methodData.methodName);
      methodElement.setAttribute('data-package-name', methodData.package);

      const img = document.createElement('div')
      if (methodData.className) {
        img.classList.add('codicon', 'codicon-symbol-method');
      } else {
        img.classList.add('codicon', 'codicon-symbol-constant');
      }
      if (methodData.level === 'Basic') {
        img.classList.add('basic');
      }
      methodElement.appendChild(img);

      addText(methodElement, `${methodData.package}\u2004:\u2004`);

      if (methodData.className) {
        addText(methodElement, methodData.className, 'class-entry');
        addText(methodElement, '\u2004.\u2004');
      }

      addText(methodElement, methodData.methodName, 'method-entry');

      addText(methodElement, methodData.infoString, 'info-entry');

      addText(methodElement, methodData.topics.join('\u2002\u2004'), 'topics-entry');

      methodElement.addEventListener('click', () => {
        handleMethodClicked(methodData.className, methodData.methodName, methodData.package);
      });

      list.appendChild(methodElement);

      navElements.push(methodElement);

      const commentLines = methodData.commentLines
      const commentsLength = commentLines.length;
      if (methodData.argsString || commentsLength > 0) {
        const ul = document.createElement('ul');
        ul.className = 'info-list';

        if (methodData.argsString) {
          const argElement = document.createElement('li');
          argElement.className = 'args-element';
          const str = methodData.argsString.trim().replace(/\s+/g, '\u2002\u2004');
          const argsText = document.createTextNode(str);
          argElement.appendChild(argsText);
          ul.appendChild(argElement);
        }

        if (commentsLength > 0) {
          let endIndex = 0;
          for (let lineIndex = commentsLength - 1; lineIndex > -1; lineIndex--) {
            const line = commentLines[lineIndex];
            const commentParts = line.split('##');
            const str = commentParts[commentParts.length - 1];

            if (str.trim().length !== 0) {
              endIndex = lineIndex;
              break;
            }
          }

          let checkEmpty = true;
          for (let lineIndex = 0; lineIndex < endIndex + 1; lineIndex++) {
            const line = commentLines[lineIndex];
            const commentParts = line.split('##');
            let str = commentParts[commentParts.length - 1];

            if (str.trim().length === 0) {
              if (checkEmpty) {
                continue;
              }
              str = '\u2002';
            }
            checkEmpty = false;

            const commentElement = document.createElement('li');
            commentElement.className = 'comment-element';
            const commentText = document.createTextNode(str);
            commentElement.appendChild(commentText);
            ul.appendChild(commentElement);
          }
        }

        list.appendChild(ul);
      }
    }

    navigationElements = navElements;
    selectedElement = undefined;
  }

  function enableSearch(enabled) {
    methodInput.disabled = !enabled;
    classInput.disabled = !enabled;
    document.querySelector('#localButton').disabled = !enabled;
    document.querySelector('#argsButton').disabled = !enabled;
    document.querySelector('#commentsButton').disabled = !enabled;
  }

  function debounce(callback, wait) {
    let timeout;
    return (...args) => {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => callback.apply(context, args), wait);
    };
  }

  function handleMethodClicked(className, methodName, packageName) {
    vscode.postMessage({type: 'methodSelected', className, methodName, packageName,});
  }

  vscode.postMessage({type: 'ready'});
}());
