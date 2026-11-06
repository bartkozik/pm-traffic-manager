import * as Y from 'yjs';

export class NodeExtractor {
  constructor(versionManager) {
    this.versionManager = versionManager;
  }

  async extractNodes(roomname) {
    try {
      const versionsResult = await this.versionManager.getVersions(roomname, { limit: 1 });

      if (!versionsResult.versions || versionsResult.versions.length === 0) {
        return [];
      }

      const latestVersion = versionsResult.versions[0];
      const versionData = await this.versionManager.getVersionData(roomname, latestVersion.timestamp);

      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, versionData);

      const nodes = [];

      const yNodes = ydoc.getMap('nodes');

      if (yNodes && yNodes.size > 0) {
        yNodes.forEach((node, nodeId) => {
          if (node && typeof node === 'object') {
            nodes.push({
              id: node.id || nodeId,
              type: node.type || 'unknown',
              data: {
                label: node.data?.label || node.label || nodeId
              }
            });
          }
        });
      }

      return nodes;
    } catch (error) {
      throw new Error(`Failed to extract nodes: ${error.message}`);
    }
  }

  async extractNodeContent(roomname, nodeId) {
    try {
      const versionsResult = await this.versionManager.getVersions(roomname, { limit: 1 });

      if (!versionsResult.versions || versionsResult.versions.length === 0) {
        throw new Error('No versions found');
      }

      const latestVersion = versionsResult.versions[0];
      const versionData = await this.versionManager.getVersionData(roomname, latestVersion.timestamp);

      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, versionData);

      let nodeContent = null;
      let foundNode = null;

      const yNodes = ydoc.getMap('nodes');

      if (yNodes && yNodes.has(nodeId)) {
        foundNode = yNodes.get(nodeId);
        nodeContent = this.extractContentFromNode(foundNode);
      }

      if (!foundNode) {
        throw new Error(`Node ${nodeId} not found`);
      }

      return {
        content: nodeContent,
        nodeType: foundNode.type || 'unknown',
        timestamp: latestVersion.timestamp
      };
    } catch (error) {
      throw new Error(`Failed to extract node content: ${error.message}`);
    }
  }

  extractContentFromNode(node) {
    if (!node || typeof node !== 'object') {
      return 'No content available';
    }

    if (node.data) {
      if (node.type === 'artifactLatchNode') {
        if (node.data.isLocked && node.data.lockedContent) {
          return node.data.lockedContent;
        }
        if (node.data.interpolatedOutput) {
          return node.data.interpolatedOutput;
        }
        if (node.data.currentContent) {
          return node.data.currentContent;
        }
      }

      if (node.type === 'textNode') {
        if (node.data.interpolatedOutputs && Array.isArray(node.data.interpolatedOutputs) && node.data.interpolatedOutputs.length > 0) {
          if (node.data.interpolatedOutputs.length === 1) {
            return node.data.interpolatedOutputs[0].content;
          } else {
            return node.data.interpolatedOutputs
              .map(output => `=== ${output.name} ===\n${output.content}`)
              .join('\n\n');
          }
        }
        if (node.data.content) {
          return node.data.content;
        }
      }

      if (node.data.lastOutput) return node.data.lastOutput;

      if (node.data.content) return node.data.content;
      if (node.data.text) return node.data.text;
      if (node.data.value) return node.data.value;
      if (node.data.currentContent) return node.data.currentContent;
    }

    if (node.content) return node.content;
    if (node.text) return node.text;
    if (node.value) return node.value;

    return `Node of type: ${node.type || 'unknown'}`;
  }
}
